import WS from "jest-websocket-mock";
import {
  CONNECTION_REQUEST_MESSAGE,
  RealWsJsonClient,
} from "../../client/realWsJsonClient";
import ResponseParser from "../../client/responseParser";
import GenericIncomingMessageHandler from "../../client/services/genericIncomingMessageHandler";

/**
 * 服务端持久订阅的回归测试。
 *
 * `statement`/`positions`/`order_events` 是服务端持久订阅：快照之后订阅仍存活，
 * 同 `service$id` 的重复 subscribe 被服务端当作重复订阅静默忽略（不回帧、
 * 也不回 error），客户端于是永久 await。因此 Promise 型读取必须 settle 时发
 * 退订帧；流式订阅提前 break 也会退订。`quotes/get`/`accounts`/`market_hours`
 * 服务端自灭，重复订阅照常回帧。
 *
 * 下面的假服务端复刻这套语义（持久订阅未退订 → 重复 subscribe 不回帧）。
 */

const WS_URL = "ws://localhost:9872";
const accessToken = "test-access-token";
const ACCOUNT = "26078963SCHW";

const connectionResponse = {
  session: "17a7_test",
  build: "27.2323.3-B0",
  ver: "27.*.*",
};

const loginResponse = {
  payload: [
    {
      header: { service: "login", id: "login", ver: 0, type: "snapshot" },
      body: { authenticationStatus: "OK", authenticated: true },
    },
  ],
};

/** 服务端持久订阅服务：未退订前，重复 subscribe 被静默忽略。 */
const PERSISTENT = new Set([
  "statement",
  "positions",
  "order_events",
  "place_order",
]);

type Header = { service: string; id: string; ver: number; type?: string };

const header = (m: unknown): Header | undefined =>
  (m as { payload?: { header?: Header }[] })?.payload?.[0]?.header;

const params = (m: unknown): Record<string, string> | undefined =>
  (m as { payload?: { params?: Record<string, string> }[] })?.payload?.[0]
    ?.params;

const requestFrames = (server: WS, service: string, id: string): unknown[] =>
  server.messages.filter((m) => {
    const h = header(m);
    return h?.service === service && h?.id === id;
  });

/** 该帧在整条上行流里的序号（断言帧的**到达先后**用） */
const frameIndex = (server: WS, frame: unknown): number =>
  server.messages.indexOf(frame);

async function waitFor(
  predicate: () => boolean,
  { maxMs = 20_000, stepMs = 5 } = {},
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > maxMs)
      throw new Error("waitFor: timed out waiting for condition");
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

async function waitRequest(
  server: WS,
  service: string,
  id: string,
  occurrence = 0,
): Promise<unknown> {
  await waitFor(() => requestFrames(server, service, id).length > occurrence);
  return requestFrames(server, service, id)[occurrence];
}

/** 挂死必须以失败结算，而不是挂满 jest 超时 */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out (hung): ${what}`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function bodyFor(h: Header): unknown {
  if (h.service === "statement")
    return { values: { CASH_BALANCE: 5, NET_LIQ: 6.99 } };
  if (h.service === "positions") return { account: ACCOUNT, positions: [] };
  return {};
}

/**
 * 假服务端：`live` 复刻服务端订阅表（key → 建立该订阅的请求帧 JSON）。
 * 返回 false = 本次 subscribe 被当作重复订阅静默忽略（不回任何帧）。
 * 抑制条件是"同一持久订阅上收到逐字相同的请求"：
 * - statement/positions 同 ver、同 params 重发 → 不回帧；
 * - place_order 的 CONFIRM→SUBMIT 复用同一草稿 id 但 action/ver 不同 → 照常回帧。
 */
function makeServer(): {
  server: WS;
  serve: (request: unknown) => boolean;
} {
  const server = new WS(WS_URL, { jsonProtocol: true });
  const live = new Map<string, string>();
  const serve = (request: unknown): boolean => {
    const h = header(request);
    if (!h) return false;
    if (h.service === "unsubscribe") {
      const p = params(request) ?? { targetService: "", targetRequestId: "" };
      live.delete(`${p.targetService}$${p.targetRequestId}`);
      server.send({
        payload: [{ header: { ...h, type: "snapshot" }, body: { ...p } }],
      });
      return true;
    }
    const key = `${h.service}$${h.id}`;
    const wire = JSON.stringify(request);
    if (PERSISTENT.has(h.service)) {
      if (live.get(key) === wire) return false; // 重复订阅：静默忽略
      live.set(key, wire);
    }
    server.send({
      payload: [{ header: { ...h, type: "snapshot" }, body: bodyFor(h) }],
    });
    return true;
  };
  return { server, serve };
}

function makeClient(): RealWsJsonClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const socketFactory = (url: string, _h: Record<string, string>): any =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new (WebSocket as any)(url);
  return new RealWsJsonClient(
    {
      wsUrl: WS_URL,
      handshakeTimeoutMs: 0,
      heartbeatTimeoutMs: 0,
      reconnectJitterRatio: 0,
      socketFactory,
    },
    undefined,
    new ResponseParser(new GenericIncomingMessageHandler()),
  );
}

async function authenticate(
  server: WS,
  client: RealWsJsonClient,
): Promise<void> {
  const auth = client.authenticateWithAccessToken({ accessToken });
  auth.catch(() => undefined);
  await waitFor(() => server.messages.length > 0);
  expect(server.messages[0]).toEqual(CONNECTION_REQUEST_MESSAGE);
  server.send(connectionResponse);
  server.send(loginResponse);
  await waitFor(() => client.isConnected());
}

describe("persistent server subscription", () => {
  afterEach(() => {
    WS.clean();
  });

  it("a second getStatement in the same session resolves (read must release its subscription)", async () => {
    const { server, serve } = makeServer();
    const client = makeClient();
    try {
      await authenticate(server, client);

      // 1) 第一次读：服务端建立持久订阅并回快照
      const first = withTimeout(
        client.getStatement(ACCOUNT),
        3000,
        "statement #1",
      );
      expect(
        serve(await waitRequest(server, "statement", "account-statement")),
      ).toBe(true);
      const body = await first;
      expect(
        (body.body as { values: { CASH_BALANCE: number } }).values.CASH_BALANCE,
      ).toBe(5);

      // 2) settle 时必须已向服务端退订
      const unsub = await waitRequest(
        server,
        "unsubscribe",
        "unsubscribe-account-statement",
      );
      expect(serve(unsub)).toBe(true);

      // 3) 第二次读：服务端此时才把它当新订阅
      const second = withTimeout(
        client.getStatement(ACCOUNT),
        3000,
        "statement #2",
      );
      const req2 = await waitRequest(
        server,
        "statement",
        "account-statement",
        1,
      );
      // 退订帧必须先于第二次 subscribe 到达服务端（到达序 = 服务端处理序）
      expect(frameIndex(server, unsub)).toBeLessThan(frameIndex(server, req2));
      expect(serve(req2)).toBe(true);
      const body2 = await second;
      expect(
        (body2.body as { values: { CASH_BALANCE: number } }).values
          .CASH_BALANCE,
      ).toBe(5);
    } finally {
      client.disconnect();
    }
  }, 15_000);

  it("a repeated early-break stream read resolves (positions)", async () => {
    const { server, serve } = makeServer();
    const client = makeClient();
    const readOnce = async () => {
      for await (const msg of client.getPositions(ACCOUNT)) return msg;
      throw new Error("positions stream ended without a snapshot");
    };
    try {
      await authenticate(server, client);

      const first = withTimeout(readOnce(), 3000, "positions #1");
      expect(serve(await waitRequest(server, "positions", "positions"))).toBe(
        true,
      );
      await first;

      // for-await 提前 break 走 return() → releaseSubscription 退订
      const unsub = await waitRequest(
        server,
        "unsubscribe",
        "unsubscribe-positions",
      );
      expect(serve(unsub)).toBe(true);

      const second = withTimeout(readOnce(), 3000, "positions #2");
      expect(
        serve(await waitRequest(server, "positions", "positions", 1)),
      ).toBe(true);
      await second;
    } finally {
      client.disconnect();
    }
  }, 15_000);

  it("CONFIRM keeps its draft subscription alive for SUBMIT (write path never releases)", async () => {
    const { server, serve } = makeServer();
    const client = makeClient();
    const draft = {
      accountNumber: ACCOUNT,
      symbol: "SCHF",
      quantity: 0.05,
      orderType: "MARKET" as const,
    };
    const DRAFT_ID = "update-draft-order-SCHF";
    try {
      await authenticate(server, client);

      const confirm = withTimeout(client.confirmOrder(draft), 3000, "confirm");
      expect(serve(await waitRequest(server, "place_order", DRAFT_ID))).toBe(
        true,
      );
      await confirm;

      // 草稿订阅必须活到 SUBMIT 完成帧（退订会让 SUBMIT 失去价格 patch 基底）
      expect(
        requestFrames(server, "unsubscribe", `unsubscribe-${DRAFT_ID}`),
      ).toHaveLength(0);

      const submit = client.submitOrder(draft);
      submit.catch(() => undefined);
      expect(serve(await waitRequest(server, "place_order", DRAFT_ID, 1))).toBe(
        true,
      );

      // 退订请求自身绝不退订（`unsubscribe-unsubscribe-…` 自递归防护）
      expect(
        server.messages.filter((m) =>
          String(header(m)?.id ?? "").startsWith("unsubscribe-unsubscribe-"),
        ),
      ).toHaveLength(0);
    } finally {
      client.disconnect();
    }
  }, 15_000);
});
