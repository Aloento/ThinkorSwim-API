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
import AccountsMessageHandler from "../../client/services/accountsMessageHandler";
import UnsubscribeMessageHandler from "../../client/services/unsubscribeMessageHandler";
import {
  ParsedPayloadResponse,
  RawPayloadResponse,
} from "../../client/tdaWsJsonTypes";

/**
 * 任务11：dataStore 生命周期清理 + iterable 提前退出联动。
 * - handler 级：removeStore（按 service$id 前缀删全部 ver）/ clearStores /
 *   storeSize 测试钩子的直接单测；
 * - 客户端级：for-await break / 循环体异常触发 SubscriptionStream 的
 *   return() → dataStore 条目回收 + best-effort unsubscribe 帧（默认开，
 *   autoUnsubscribe:false 可关）；one-shot settle 后条目回收；
 *   disconnect() 全量清空且不发逐订阅的 unsubscribe 帧。
 *
 * 用真实定时器（同 wsJsonClient.test.ts）：断言直接轮询 server.messages /
 * storeSize，不依赖 jest-websocket-mock 的假定时器兼容路径。
 */

const accessToken = "p4-lifecycle-token";

const connectionResponse = {
  session: "17a7_p4test",
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

const quotesRequest = new QuotesMessageHandler().buildRequest(["AAPL"]);
const quotesSnapshot = (last: number): RawPayloadResponse => ({
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

const unsubscribeQuotes = new UnsubscribeMessageHandler().buildRequest({
  targetService: "quotes",
  targetRequestId: "generalQuotes",
});

/** unsubscribe 应答 snapshot（真实服务端回活跃订阅列表或 error，两者等价） */
const unsubscribeSnapshot = {
  payload: [
    {
      header: {
        service: "unsubscribe",
        id: "unsubscribe-generalQuotes",
        ver: 0,
        type: "snapshot",
      },
      body: { targetService: "quotes", targetRequestId: "generalQuotes" },
    },
  ],
};

/** 真定时器轮询：等待条件成立或超时 */
async function waitFor(
  predicate: () => boolean,
  timeoutMs = 3_000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor: timed out waiting for condition");
    }
    await new Promise((r) => setTimeout(r, 5));
  }
}

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 建 mock server + 注入 ResponseParser(外部 genericHandler) 的客户端并完成
 * 握手——storeSize 断言直接打在实际解析用的 handler 上。
 */
async function connectClient(
  url: string,
  options: RealWsJsonClientOptions = {},
): Promise<{
  server: WS;
  client: RealWsJsonClient;
  genericHandler: GenericIncomingMessageHandler;
}> {
  const server = new WS(url, { jsonProtocol: true });
  const genericHandler = new GenericIncomingMessageHandler();
  const client = new RealWsJsonClient(
    options,
    new WebSocket(url),
    new ResponseParser(genericHandler),
  );
  await server.connected;
  const auth = client.authenticateWithAccessToken({ accessToken });
  auth.catch(() => undefined);
  server.send(connectionResponse);
  server.send(loginResponse);
  await expect(server).toReceiveMessage(CONNECTION_REQUEST_MESSAGE);
  await expect(server).toReceiveMessage(
    new LoginMessageHandler().buildRequest(accessToken),
  );
  await waitFor(() => client.isConnected());
  return { server, client, genericHandler };
}

describe("GenericIncomingMessageHandler dataStore lifecycle (P4)", () => {
  const snapshot = (
    service: string,
    id: string,
    ver: number,
  ): RawPayloadResponse => ({
    payload: [
      { header: { service, id, ver, type: "snapshot" }, body: { v: ver } },
    ],
  });

  it("removeStore deletes the service+id entry and is idempotent", () => {
    const handler = new GenericIncomingMessageHandler();
    handler.parseResponse(snapshot("quotes", "generalQuotes", 0));
    // 不变量：同 service+id 至多一条基底——新 ver 的 snapshot 是同一
    // 逻辑文档的新基底，旧条目被覆盖清理（旧实现此处会 ver:0/ver:1 并存）。
    handler.parseResponse(snapshot("quotes", "generalQuotes", 1));
    expect(handler.storeSize()).toBe(1);
    handler.parseResponse(snapshot("quotes", "generalQuotesX", 0));
    expect(handler.storeSize()).toBe(2);

    // 前缀按 `service_id_` 精确匹配：generalQuotesX 不属于 generalQuotes
    expect(handler.removeStore("quotes", "generalQuotes")).toBe(1);
    expect(handler.storeSize()).toBe(1);

    // 幂等：再次删除返回 0，不抛错
    expect(handler.removeStore("quotes", "generalQuotes")).toBe(0);
    expect(handler.storeSize()).toBe(1);
    expect(handler.removeStore("nope", "missing")).toBe(0);
  });

  it("clearStores empties every entry", () => {
    const handler = new GenericIncomingMessageHandler();
    handler.parseResponse(snapshot("quotes", "generalQuotes", 0));
    handler.parseResponse(snapshot("accountPositions", "positions", 0));
    handler.parseResponse(snapshot("chart", "chart-AAPL", 1));
    expect(handler.storeSize()).toBe(3);
    handler.clearStores();
    expect(handler.storeSize()).toBe(0);
    handler.clearStores(); // 幂等
    expect(handler.storeSize()).toBe(0);
  });

  it("patches keep contributing to the same store entry the removal sweeps", () => {
    const handler = new GenericIncomingMessageHandler();
    handler.parseResponse(snapshot("quotes", "generalQuotes", 0));
    handler.parseResponse({
      payload: [
        {
          header: {
            service: "quotes",
            id: "generalQuotes",
            ver: 0,
            type: "patch",
          },
          body: {
            patches: [{ op: "replace", path: "/v", value: 42 }],
          },
        },
      ],
    });
    // snapshot + patch 共用 key quotes_generalQuotes_0：条目数仍是 1
    expect(handler.storeSize()).toBe(1);
    expect(handler.removeStore("quotes", "generalQuotes")).toBe(1);
    expect(handler.storeSize()).toBe(0);
  });
});

describe("subscription stream cleanup (P4)", () => {
  afterEach(() => {
    WS.clean();
    jest.restoreAllMocks();
  });

  it("break out of for-await clears the store entry and best-effort unsubscribes", async () => {
    const { server, client, genericHandler } = await connectClient(
      "ws://localhost:1240",
    );
    try {
      const stream = client.quotes(["AAPL"]);
      await expect(server).toReceiveMessage(quotesRequest);
      server.send(quotesSnapshot(101));

      const seen: ParsedPayloadResponse[] = [];
      for await (const msg of stream) {
        seen.push(msg);
        break;
      }
      expect(seen).toHaveLength(1);
      // return() 在 break 时被 await：store 基底同步回收
      expect(genericHandler.storeSize()).toBe(0);

      // best-effort unsubscribe 帧（fire-and-forget，params 指向原订阅）
      await expect(server).toReceiveMessage(unsubscribeQuotes);

      // unsubscribe 应答自身的 store 条目也必须随 one-shot settle 回收
      server.send(unsubscribeSnapshot);
      await waitFor(() => genericHandler.storeSize() === 0);
      await tick(30);
      expect(genericHandler.storeSize()).toBe(0);
    } finally {
      client.disconnect();
    }
  });

  it("an exception in the loop body runs the same cleanup and still propagates", async () => {
    const { server, client, genericHandler } = await connectClient(
      "ws://localhost:1241",
    );
    try {
      const stream = client.quotes(["AAPL"]);
      await expect(server).toReceiveMessage(quotesRequest);
      server.send(quotesSnapshot(202));

      let first: ParsedPayloadResponse | undefined;
      await expect(
        (async () => {
          for await (const msg of stream) {
            first = msg;
            throw new Error("consumer boom");
          }
        })(),
      ).rejects.toThrow("consumer boom");
      expect(first?.service).toBe("quotes");
      expect(genericHandler.storeSize()).toBe(0);
      await expect(server).toReceiveMessage(unsubscribeQuotes);
    } finally {
      client.disconnect();
    }
  });

  it("autoUnsubscribe:false skips the unsubscribe frame but still clears the store", async () => {
    const { server, client, genericHandler } = await connectClient(
      "ws://localhost:1242",
      { autoUnsubscribe: false },
    );
    try {
      const stream = client.quotes(["AAPL"]);
      await expect(server).toReceiveMessage(quotesRequest);
      server.send(quotesSnapshot(101));

      const seen: ParsedPayloadResponse[] = [];
      for await (const msg of stream) {
        seen.push(msg);
        break;
      }
      expect(seen).toHaveLength(1);
      expect(genericHandler.storeSize()).toBe(0);

      const messageCount = server.messages.length;
      await tick(50);
      expect(server.messages).toHaveLength(messageCount);
    } finally {
      client.disconnect();
    }
  });

  it("one-shot responses reclaim their store entry on settle", async () => {
    const { server, client, genericHandler } = await connectClient(
      "ws://localhost:1243",
    );
    try {
      const pending = client.getAccounts();
      await expect(server).toReceiveMessage(
        new AccountsMessageHandler().buildRequest(undefined),
      );
      server.send({
        payload: [
          {
            header: {
              service: "accounts",
              id: "accounts",
              ver: 0,
              type: "snapshot",
            },
            body: { items: [] },
          },
        ],
      });
      await pending;
      // 修复前 accounts_accounts_0 会永久驻留
      expect(genericHandler.storeSize()).toBe(0);
    } finally {
      client.disconnect();
    }
  });

  it("disconnect() clears all entries without per-subscription unsubscribe frames", async () => {
    const { server, client, genericHandler } = await connectClient(
      "ws://localhost:1244",
    );
    try {
      const stream = client.quotes(["AAPL"]);
      await expect(server).toReceiveMessage(quotesRequest);
      server.send(quotesSnapshot(101));

      const received: ParsedPayloadResponse[] = [];
      let exited = false;
      void (async () => {
        for await (const msg of stream) {
          received.push(msg);
        }
        exited = true;
      })();
      await waitFor(() => received.length >= 1 && !exited);
      expect(genericHandler.storeSize()).toBe(1);

      const before = server.messages.length;
      client.disconnect();
      // 会话整体销毁：全量清空，且逐订阅 unsubscribe 帧无意义——一条都不发
      expect(genericHandler.storeSize()).toBe(0);
      // buffer.end() 让循环干净退出；退出触发的 return() 不再发帧（未连接）
      await waitFor(() => exited);
      await tick(50);
      expect(server.messages).toHaveLength(before);
    } finally {
      client.disconnect();
    }
  });
});
