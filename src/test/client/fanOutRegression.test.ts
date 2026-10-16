import WS from "jest-websocket-mock";
import {
  CONNECTION_REQUEST_MESSAGE,
  RealWsJsonClient,
} from "../../client/realWsJsonClient";
import ResponseParser from "../../client/responseParser";
import GenericIncomingMessageHandler from "../../client/services/genericIncomingMessageHandler";
import PositionsMessageHandler from "../../client/services/positionsMessageHandler";
import StatementMessageHandler from "../../client/services/statementMessageHandler";
import QuotesGetMessageHandler from "../../client/services/quotesGetMessageHandler";
import { ParsedPayloadResponse } from "../../client/tdaWsJsonTypes";

/**
 * 帧分发（fan-out）回归测试。
 *
 * 共享拉取队列 + filter 丢弃的模型下，一个请求的等待者先拉走属于另一个请求的
 * 帧，那帧就被永久丢弃 → 后续请求挂死。这里覆盖生产里的两种场景：
 * 「流式请求提前 break，后续 one-shot 的响应帧落在同一 socket」，以及
 * 「持续 for-await 的流与 one-shot 并发」。
 * 单泵 + 每订阅者专属队列（ResponseRouter）下每轮都干净完成。
 */

const WS_URL = "ws://localhost:9871";
const accessToken = "test-access-token";
const ACCOUNT = "1234-5678";

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

const positionsSnapshot: ParsedPayloadResponse = {
  payload: [
    {
      header: {
        service: "positions",
        id: "positions",
        ver: 0,
        type: "snapshot",
      },
      body: { account: ACCOUNT, positions: [] },
    },
  ],
};

const statementSnapshot = {
  payload: [
    {
      header: {
        service: "statement",
        id: "account-statement",
        ver: 0,
        type: "snapshot",
      },
      body: { messages: [] },
    },
  ],
};

const quotesGetSnapshot = (last: number) => ({
  payload: [
    {
      header: {
        service: "quotes/get",
        id: "quotes/get",
        ver: 0,
        type: "snapshot",
      },
      body: { items: [{ symbol: "SCHF", values: { LAST: last } }] },
    },
  ],
});

const positionsRequest = new PositionsMessageHandler().buildRequest(ACCOUNT);
const statementRequest = new StatementMessageHandler().buildRequest(ACCOUNT);
const quotesGetRequest = new QuotesGetMessageHandler().buildRequest({
  symbols: ["SCHF"],
  fields: ["LAST", "BID", "ASK"],
});

function setup(): { server: WS; client: RealWsJsonClient } {
  const server = new WS(WS_URL, { jsonProtocol: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const socketFactory = (url: string, _h: Record<string, string>): any =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new (WebSocket as any)(url);
  const client = new RealWsJsonClient(
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
  return { server, client };
}

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

/** 服务端是否已收到过该请求帧（扫描全部消息：unsubscribe 等旁路帧不影响断言） */
async function expectSent(
  server: WS,
  expected: unknown,
  { maxMs = 20_000, stepMs = 5 } = {},
): Promise<void> {
  const start = Date.now();
  const matches = (): number[] =>
    server.messages
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => JSON.stringify(m) === JSON.stringify(expected))
      .map(({ i }) => i);
  while (matches().length === 0) {
    if (Date.now() - start > maxMs)
      throw new Error("expectSent: timed out waiting for request frame");
    await new Promise((r) => setTimeout(r, stepMs));
  }
  // 断言"恰好一次"：重复发送同一请求帧属于回归
  expect(matches()).toHaveLength(1);
}

/** 带超时的一等 await——挂死必须以失败结算而不是挂满 jest 超时 */
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

async function authenticate(server: WS, client: RealWsJsonClient) {
  const auth = client.authenticateWithAccessToken({ accessToken });
  auth.catch(() => undefined);
  await expectSent(server, CONNECTION_REQUEST_MESSAGE);
  server.send(connectionResponse);
  server.send(loginResponse);
  await waitFor(() => client.isConnected());
}

/**
 * 一轮混合调用：positions 流（收 snapshot 即 break）→ statement one-shot →
 * quotes/get one-shot。响应顺序与服务端实况一致：
 * positions snapshot 之后才发后续请求的响应。
 */
async function runRound(
  server: WS,
  client: RealWsJsonClient,
  last: number,
): Promise<void> {
  // 1) positions：for await 收 snapshot 即 break（提前退出，走 return 路径）
  const positions = (async () => {
    for await (const msg of client.getPositions(ACCOUNT)) {
      return msg;
    }
    throw new Error("positions stream ended without a snapshot");
  })();
  await expectSent(server, positionsRequest);
  server.send(positionsSnapshot);
  await withTimeout(positions, 2000, "positions snapshot round");

  // 2) statement one-shot
  const statement = client.getStatement(ACCOUNT);
  await expectSent(server, statementRequest);
  server.send(statementSnapshot);
  await withTimeout(statement, 2000, "statement round");

  // 3) quotes/get one-shot
  const quotes = client.getQuotes({
    symbols: ["SCHF"],
    fields: ["LAST", "BID", "ASK"],
  });
  await expectSent(server, quotesGetRequest);
  server.send(quotesGetSnapshot(last));
  const q = await withTimeout(quotes, 2000, "quotes/get round");
  expect(
    (q.body as { items: { values: { LAST: number } }[] }).items[0].values.LAST,
  ).toBe(last);
}

describe("fan-out regression", () => {
  afterEach(() => {
    WS.clean();
  });

  it("completes multiple sequential rounds of mixed stream + one-shot requests", async () => {
    const { server, client } = setup();
    try {
      await authenticate(server, client);
      // 多轮串联：残留等待者吞帧时，第二轮起挂死
      await runRound(server, client, 2, 33.1);
      await runRound(server, client, 5, 33.2);
      await runRound(server, client, 8, 33.3);
    } finally {
      client.disconnect();
    }
  }, 15_000);

  it("a stream that never breaks does not starve one-shot requests", async () => {
    // 持续 for-await 的流与 one-shot 并发：两类帧必须各归各位
    const { server, client } = setup();
    try {
      await authenticate(server, client);
      const sink: ParsedPayloadResponse[] = [];
      void (async () => {
        for await (const msg of client.getPositions(ACCOUNT)) {
          sink.push(msg);
        }
      })();
      await expectSent(server, positionsRequest);

      const quotes = client.getQuotes({
        symbols: ["SCHF"],
        fields: ["LAST", "BID", "ASK"],
      });
      await expectSent(server, quotesGetRequest);

      // 交错发送两类帧：顺序颠倒（先 quotes 后 positions）同样必须各归各位
      server.send(quotesGetSnapshot(41.5));
      server.send(positionsSnapshot);
      server.send(positionsSnapshot);

      const q = await withTimeout(quotes, 2000, "concurrent quotes/get");
      expect(
        (q.body as { items: { values: { LAST: number } }[] }).items[0].values
          .LAST,
      ).toBe(41.5);
      await waitFor(() => sink.length >= 2);
      expect(sink[0].service).toBe("positions");
    } finally {
      client.disconnect();
    }
  }, 15_000);

  it("an error frame terminates every consumer of that request", async () => {
    // error 帧以 WebSocketApiError 终止该订阅上等待中的消费者
    const { server, client } = setup();
    try {
      await authenticate(server, client);
      const statement = client.getStatement(ACCOUNT);
      statement.catch(() => undefined);
      await expectSent(server, statementRequest);
      server.send({
        payload: [
          {
            header: {
              service: "statement",
              id: "account-statement",
              ver: 0,
              type: "error",
            },
            body: { message: "no such account", isTerminal: true },
          },
        ],
      });
      await expect(
        withTimeout(statement, 2000, "statement error"),
      ).rejects.toThrow("no such account");
    } finally {
      client.disconnect();
    }
  }, 15_000);
});
