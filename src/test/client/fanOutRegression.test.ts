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
 * 2026-10-16 挂死事故的回归测试（Schwab-DCA run 38878151523：
 * dry_run 第二轮的第一个 getQuotes 永久挂起，CI 7 分钟后人工取消）。
 *
 * 旧模型（单条共享队列 + filter 丢弃）下，只要一个请求的等待者先拉走了
 * 属于另一个请求的帧，那帧就被 filter 永久丢弃；本测试模拟生产里的
 * 「流式请求提前 break，后续 one-shot 的响应帧落在同一个 socket 上」，
 * 在旧实现上第二轮 getQuotes 永不 resolve（jest 超时即失败）。
 *
 * 修复后（ResponseRouter：单泵 + 每订阅者专属队列）每轮都干净完成。
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
  // 断言"恰好一次"：重复发送同一请求帧属于回归（挂死场景重试的隐患）
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
 * 复刻 DCA dry_run 的一轮：positions 流（收 snapshot 即 break）→
 * statement one-shot → quotes/get one-shot。响应顺序按线上实况：
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

  // 3) quotes/get one-shot——事故里第一轮这步成功、第二轮永久挂起
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

describe("fan-out regression (2026-10-16 hang)", () => {
  afterEach(() => {
    WS.clean();
  });

  it("completes multiple sequential rounds of mixed stream + one-shot requests", async () => {
    const { server, client } = setup();
    try {
      await authenticate(server, client);
      // 第一轮：positions(break) → statement → quotes
      await runRound(server, client, 2, 33.1);
      // 第二轮：旧实现从这里开始挂死（残留等待者吞帧）
      await runRound(server, client, 5, 33.2);
      // 第三轮保险：事故现场是"第二轮起必挂"，多跑一轮坐实稳定性
      await runRound(server, client, 8, 33.3);
    } finally {
      client.disconnect();
    }
  }, 15_000);

  it("a stream that never breaks does not starve one-shot requests", async () => {
    // 另一个吞帧场景：一个持续 for-await 的流与 one-shot 并发。
    // 旧模型里流消费者与 one-shot 抢同一条队列，snapshot 类帧
    // 可能落入错误等待者被丢弃。
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
    // error 语义保持：promise 与 iterable 双消费者都要收到 WebSocketApiError
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
