import WS from "jest-websocket-mock";
import {
  CONNECTION_REQUEST_MESSAGE,
  RealWsJsonClient,
  RealWsJsonClientOptions,
} from "../../client/realWsJsonClient";
import ResponseParser from "../../client/responseParser";
import GenericIncomingMessageHandler from "../../client/services/genericIncomingMessageHandler";
import LoginMessageHandler from "../../client/services/loginMessageHandler";
import QuotesMessageHandler from "../../client/services/quotesMessageHandler";
import UserPropertiesMessageHandler from "../../client/services/userPropertiesMessageHandler";
import {
  AuthError,
  ParsedPayloadResponse,
  TransportError,
} from "../../client/tdaWsJsonTypes";

/**
 * 重连退避、心跳看门狗、订阅重放、握手超时、Error 对象化。使用
 * jest.useFakeTimers + socketFactory 注入 mock 全局 WebSocket（重连必须走
 * 工厂新建 socket，构造注入只供首轮）。
 *
 * mock-socket 的 open/客户端 close/send 事件经 setTimeout(4ms) 派发，
 * server.close() 则同步派发——配合假定时器统一用 advanceTimersByTimeAsync
 * 同时放行微任务与到期定时器（jest-websocket-mock 的 toReceiveMessage
 * 依赖真实 setTimeout，与假定时器不兼容，故此处直接断言 server.messages）。
 */

const WS_URL = "ws://localhost:9870";
const accessToken = "test-access-token";

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

const loginFailureResponse = {
  payload: [
    {
      header: { service: "login", id: "login", ver: 0, type: "snapshot" },
      body: {
        authenticationStatus: "FAILED",
        message: "bad credentials",
      },
    },
  ],
};

const quotesSnapshot = (last: number) => ({
  payload: [
    {
      header: {
        service: "quotes",
        id: "generalQuotes",
        ver: 0,
        type: "snapshot",
      },
      body: { items: [{ symbol: "AAPL", values: { LAST: last } }] },
    },
  ],
});

const userPropertiesSnapshot = {
  payload: [
    {
      header: {
        service: "user_properties",
        id: "user_properties",
        ver: 0,
        type: "snapshot",
      },
      body: { nickname: "tester" },
    },
  ],
};

const quotesRequest = new QuotesMessageHandler().buildRequest(["AAPL"]);
const loginRequest = new LoginMessageHandler().buildRequest(accessToken);
const userPropertiesRequest = new UserPropertiesMessageHandler().buildRequest(
  undefined,
);

/** 防止握手期预期内的 reject 变成 unhandled rejection；测试仍可另行断言 */
function track<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => undefined);
  return promise;
}

/** 建 mock server 并创建走工厂的客户端；工厂记录每次调用供重连断言 */
function setup(
  url: string,
  options: Partial<RealWsJsonClientOptions> = {},
): { server: WS; client: RealWsJsonClient } {
  const server = new WS(url, { jsonProtocol: true });
  const socketFactory = (
    factoryUrl: string,
    _headers: Record<string, string>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any => {
    expect(factoryUrl).toBe(url);
    // mock 全局 WebSocket（mock-socket）只接受 url 参数
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new (WebSocket as any)(factoryUrl);
  };
  const client = new RealWsJsonClient(
    {
      wsUrl: url,
      handshakeTimeoutMs: 0,
      heartbeatTimeoutMs: 0,
      reconnectJitterRatio: 0,
      socketFactory,
      ...options,
    },
    undefined,
    new ResponseParser(new GenericIncomingMessageHandler()),
  );
  return { server, client };
}

/** 假定时器下交替放行微任务与到期定时器，直到 predicate 为真或超时 */
async function waitFor(
  predicate: () => boolean,
  { maxMs = 60_000, stepMs = 5 } = {},
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > maxMs) {
      throw new Error("waitFor: timed out waiting for condition");
    }
    await jest.advanceTimersByTimeAsync(stepMs);
  }
}

/** 等 server 收到第 index 条消息并断言内容 */
async function expectMessageAt(
  server: WS,
  index: number,
  expected: unknown,
): Promise<void> {
  await waitFor(() => server.messages.length > index);
  expect(server.messages[index]).toEqual(expected);
}

/** 完成 open → connectionResponse → login 的完整握手；base 为该 server 上已有消息数 */
async function completeHandshake(
  server: WS,
  client: RealWsJsonClient,
  base: number,
  loginResp: unknown = loginResponse,
): Promise<void> {
  await expectMessageAt(server, base, CONNECTION_REQUEST_MESSAGE);
  server.send(connectionResponse);
  server.send(loginResp);
  await waitFor(() => client.isConnected());
  await expectMessageAt(server, base + 1, loginRequest);
}

function collect(
  iterable: AsyncIterable<ParsedPayloadResponse>,
  sink: ParsedPayloadResponse[],
): void {
  void (async () => {
    for await (const msg of iterable) {
      sink.push(msg);
    }
  })();
}

describe("connectionLifecycle", () => {
  afterEach(async () => {
    // 放行 act 队列与 mock-socket 的 4ms 定时器后再拆服务器，
    // 否则 WS.clean 会在假定时器下等 _isClosed 而崩掉
    await jest.advanceTimersByTimeAsync(50);
    jest.useRealTimers();
    WS.clean();
    jest.restoreAllMocks();
  });

  it("reconnects with a fresh socket after an unexpected close and restores the quote stream", async () => {
    jest.useFakeTimers();
    const { server, client } = setup(WS_URL);
    try {
      const auth = track(client.authenticateWithAccessToken({ accessToken }));
      await completeHandshake(server, client, 0);
      await expect(auth).resolves.toEqual(
        expect.objectContaining({ authenticationStatus: "OK" }),
      );

      // 建立 quotes 订阅并收到第一帧
      const received: ParsedPayloadResponse[] = [];
      collect(client.quotes(["AAPL"]), received);
      await expectMessageAt(server, 2, quotesRequest);
      server.send(quotesSnapshot(101));
      await waitFor(() => received.length >= 1);

      // 服务端断开 → 自动重连（曾登录成功），退避 500ms（jitter=0）
      server.close();
      const beforeReconnect = Date.now();
      await waitFor(() => client.isConnecting());
      expect(Date.now() - beforeReconnect).toBeGreaterThanOrEqual(500);
      expect(client.isConnected()).toBe(false);

      // 新连接走完整握手；登录成功后原样重发活跃订阅
      const server2 = new WS(WS_URL, { jsonProtocol: true });
      await completeHandshake(server2, client, 0);
      await expectMessageAt(server2, 2, quotesRequest);

      // 流在新会话上恢复：原 for-await 消费者继续收到新帧
      server2.send(quotesSnapshot(202));
      await waitFor(() => received.length >= 2);
      expect(received[received.length - 1]).toEqual(
        expect.objectContaining({
          service: "quotes",
          body: { items: [{ symbol: "AAPL", values: { LAST: 202 } }] },
        }),
      );
    } finally {
      client.disconnect();
    }
  });

  it("treats a silent connection as dead after the heartbeat timeout and reconnects", async () => {
    jest.useFakeTimers();
    const { server, client } = setup(WS_URL, {
      heartbeatTimeoutMs: 5_000,
      reconnectBackoffInitialMs: 200,
    });
    try {
      const auth = track(client.authenticateWithAccessToken({ accessToken }));
      await completeHandshake(server, client, 0);
      void auth;

      // 心跳帧持续重置看门狗：每次静默不足 5s 不断开
      server.send({ heartbeat: 1 });
      await jest.advanceTimersByTimeAsync(4_000);
      server.send({ heartbeat: 2 });
      await jest.advanceTimersByTimeAsync(4_000);
      expect(client.isConnected()).toBe(true);

      // 超过 5s 无心跳 → 看门狗主动 close → 走统一的断连→重连路径。
      // 服务端（mock server）从未关闭，重连的 socket 重新挂到同一 server。
      const base = server.messages.length;
      await jest.advanceTimersByTimeAsync(5_000);
      await completeHandshake(server, client, base);
      expect(client.isConnected()).toBe(true);
      // 收尾：放行 act 队列/4ms 定时器，让 disconnect 关闭的 socket
      // 正常派发 close，避免 afterEach 拿到假定时器下的悬挂状态
      await jest.advanceTimersByTimeAsync(100);
    } finally {
      client.disconnect();
    }
  });

  it("replays iterable subscriptions only; in-flight promise requests reject and are not replayed", async () => {
    jest.useFakeTimers();
    const { server, client } = setup(WS_URL);
    try {
      const auth = track(client.authenticateWithAccessToken({ accessToken }));
      await completeHandshake(server, client, 0);
      void auth;

      // 流式订阅（可重放）
      const received: ParsedPayloadResponse[] = [];
      collect(client.quotes(["AAPL"]), received);
      await expectMessageAt(server, 2, quotesRequest);
      server.send(quotesSnapshot(1));

      // 一次性请求（不可重放）：已发出、响应未到
      const oneShot = track(client.userProperties());
      const oneShotOutcome = oneShot.then(
        () => "fulfilled" as const,
        (reason: unknown) => ({ rejected: reason }) as const,
      );
      await expectMessageAt(server, 3, userPropertiesRequest);

      // 断开：一次性请求必须 reject（TransportError），重发重试是调用方的事
      server.close();
      const outcome = await oneShotOutcome;
      expect(typeof outcome).toBe("object");
      if (typeof outcome !== "string") {
        expect(outcome.rejected).toBeInstanceOf(TransportError);
      }

      // 自动重连；重放只覆盖流式订阅（quotes 原样重发，一次性请求不在其中）
      const server2 = new WS(WS_URL, { jsonProtocol: true });
      await completeHandshake(server2, client, 0);
      await expectMessageAt(server2, 2, quotesRequest);
      expect(
        server2.messages.filter((m) =>
          JSON.stringify(m).includes("user_properties"),
        ),
      ).toHaveLength(0);

      // 新会话上由调用方重发一次性请求，正常拿到响应
      const retried = track(client.userProperties());
      await expectMessageAt(server2, 3, userPropertiesRequest);
      server2.send(userPropertiesSnapshot);
      await expect(retried).resolves.toEqual(
        expect.objectContaining({ service: "user_properties" }),
      );

      // 流式消费者跨越了重连：旧循环继续收到新会话的帧
      server2.send(quotesSnapshot(2));
      await waitFor(() => received.length >= 2);
    } finally {
      client.disconnect();
    }
  });

  it("rejects a hung handshake after handshakeTimeoutMs; never-authenticated and bad-credential sessions do not retry", async () => {
    jest.useFakeTimers();
    const { server, client } = setup(WS_URL, {
      handshakeTimeoutMs: 1_000,
      reconnectBackoffInitialMs: 100,
    });
    try {
      // 首轮：服务端接受连接但从不回 connectionResponse → 握手超时。
      // 从未认证成功过 → 超时后不自动重连（不无限烧连接）。
      const auth = track(client.authenticateWithAccessToken({ accessToken }));
      await jest.advanceTimersByTimeAsync(1_000);
      // 超时回调里 socket.close() 的 close 事件还要再过 4ms 才派发
      await jest.advanceTimersByTimeAsync(20);
      await expect(auth).rejects.toBeInstanceOf(TransportError);
      await expect(auth).rejects.toThrow(/Handshake timed out after 1000ms/);
      expect(client.isConnected()).toBe(false);
      expect(client.isConnecting()).toBe(false);
      await jest.advanceTimersByTimeAsync(60_000);

      // 登录失败：AuthError，同样不自动重试
      const base = server.messages.length;
      const auth2 = track(client.authenticateWithAccessToken({ accessToken }));
      await expectMessageAt(server, base, CONNECTION_REQUEST_MESSAGE);
      server.send(connectionResponse);
      server.send(loginFailureResponse);
      await expect(auth2).rejects.toBeInstanceOf(AuthError);
      await expect(auth2).rejects.toThrow(/Login failed: bad credentials/);
      expect(client.isConnected()).toBe(false);
      expect(client.isConnecting()).toBe(false);
      await jest.advanceTimersByTimeAsync(60_000);
      expect(client.isConnecting()).toBe(false);
    } finally {
      client.disconnect();
    }
  });
});
