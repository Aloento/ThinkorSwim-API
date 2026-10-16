import WS from "jest-websocket-mock";
import {
  CONNECTION_REQUEST_MESSAGE,
  RealWsJsonClient,
  RealWsJsonClientOptions,
} from "../../client/realWsJsonClient";
import ResponseParser from "../../client/responseParser";
import GenericIncomingMessageHandler from "../../client/services/genericIncomingMessageHandler";
import { PlaceLimitOrderRequestParams } from "../../client/services/placeOrderMessageHandler";
import SubmitOrderMessageHandler from "../../client/services/submitOrderMessageHandler";
import {
  RawPayloadResponse,
  WebSocketApiError,
} from "../../client/tdaWsJsonTypes";

/**
 * storeKey 跨 ver 语义。
 *
 * 服务端实际时序：CONFIRM snapshot ver:1（id=update-draft-order-<SYM>）→
 * 价格 patch ver:1 → SUBMIT patch **ver:0 同 id**（orderId 在
 * /orders/0/orderId）。
 * 同一 service+id 是同一逻辑文档的演进：
 * - patch 基底查找跨 ver 命中（键 = service+id，不含 ver）；
 * - snapshot 写入时清理同 id 其他 ver 条目（防多基底漂移）。store 不变量：
 *   每个 service+id 恰好一条基底，键后缀 = 最后 snapshot 的 ver（诊断用）；
 * - removeStore/clearStores 前缀语义不变。
 */

// ---- 纯 handler 用例：合成跨 ver 帧 ----

describe("GenericIncomingMessageHandler 跨 ver 基底", () => {
  const wrap = (item: unknown): RawPayloadResponse =>
    ({ payload: [item] }) as RawPayloadResponse;

  it("snapshot ver:1 → patch ver:0：跨 ver 合并出 orderId", () => {
    const handler = new GenericIncomingMessageHandler();
    const snapshot = handler.parseResponse(
      wrap({
        header: {
          service: "place_order",
          id: "update-draft-order-AAPL",
          ver: 1,
          type: "snapshot",
        },
        body: { groupType: "SINGLE", orders: [{ symbol: "AAPL" }] },
      }),
    );
    expect(snapshot).toHaveLength(1);
    expect(
      (snapshot[0].body as { orders: { orderId?: number }[] }).orders[0]
        .orderId,
    ).toBeUndefined();

    const patched = handler.parseResponse(
      wrap({
        header: {
          service: "place_order",
          id: "update-draft-order-AAPL",
          ver: 0,
          type: "patch",
        },
        body: {
          patches: [{ op: "add", path: "/orders/0/orderId", value: 123 }],
        },
      }),
    );
    // 若无跨 ver 基底：ver:0 patch 在空文档上 add 抛错，条目被丢弃（[]）。
    expect(patched).toHaveLength(1);
    expect(
      (patched[0].body as { orders: { orderId: number }[] }).orders[0].orderId,
    ).toBe(123);
    // 同 id 仍只有一条基底（合并写回基底键，不新建 ver:0 条目）
    expect(handler.storeSize()).toBe(1);
  });

  it("snapshot 写入清理同 id 其他 ver 基底（防多基底漂移）", () => {
    const handler = new GenericIncomingMessageHandler();
    handler.parseResponse(
      wrap({
        header: { service: "quotes", id: "q1", ver: 1, type: "snapshot" },
        body: { items: [{ symbol: "AAPL" }] },
      }),
    );
    // 跨 ver patch：合并进 ver:1 基底
    handler.parseResponse(
      wrap({
        header: { service: "quotes", id: "q1", ver: 0, type: "patch" },
        body: {
          patches: [{ op: "replace", path: "/items/0/symbol", value: "SPY" }],
        },
      }),
    );
    expect(handler.storeSize()).toBe(1);
    // 新 snapshot（任意 ver）覆盖演进结果并清掉旧条目：storeSize 仍 1，
    // 且基底键切换到新 ver（removeStore 前缀语义不变，一并回收）
    handler.parseResponse(
      wrap({
        header: { service: "quotes", id: "q1", ver: 0, type: "snapshot" },
        body: { items: [] },
      }),
    );
    expect(handler.storeSize()).toBe(1);
    expect(handler.removeStore("quotes", "q1")).toBe(1);
    expect(handler.storeSize()).toBe(0);
  });

  it("跨 ver 合并后的后续 patch 继续命中同一基底", () => {
    const handler = new GenericIncomingMessageHandler();
    handler.parseResponse(
      wrap({
        header: { service: "place_order", id: "d1", ver: 1, type: "snapshot" },
        body: { orders: [{ orderId: 0 }] },
      }),
    );
    handler.parseResponse(
      wrap({
        header: { service: "place_order", id: "d1", ver: 0, type: "patch" },
        body: {
          patches: [{ op: "replace", path: "/orders/0/orderId", value: 7 }],
        },
      }),
    );
    const again = handler.parseResponse(
      wrap({
        header: { service: "place_order", id: "d1", ver: 0, type: "patch" },
        body: {
          patches: [{ op: "replace", path: "/orders/0/orderId", value: 8 }],
        },
      }),
    );
    expect(
      (again[0].body as { orders: { orderId: number }[] }).orders[0].orderId,
    ).toBe(8);
    expect(handler.storeSize()).toBe(1);
  });
});

// ---- 客户端集成：submitOrder 走统一管道 ----

const accessToken = "task16-token";
let nextPort = 9930;

const connectionResponse = {
  session: "17a7_t16",
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

const draft: PlaceLimitOrderRequestParams = {
  accountNumber: "IND-D100579QZ",
  symbol: "AAPL",
  quantity: 1,
  limitPrice: 1,
};

/** CONFIRM 草稿 snapshot（ver:1，截断版：保留 orders+confirmation 结构） */
const confirmSnapshotFrame: RawPayloadResponse = {
  payload: [
    {
      header: {
        service: "place_order",
        id: "update-draft-order-AAPL",
        ver: 1,
        type: "snapshot",
      },
      body: {
        groupType: "SINGLE",
        maxOrders: 1,
        orders: [
          {
            orderId: 0,
            symbol: "AAPL",
            quantity: 1,
            orderType: "LIMIT",
            limitPrice: 1,
          },
        ],
        confirmation: {
          rows: [{ label: "Est. Order Value", value: "$1.00" }],
          commission: 0,
          cost: 1,
          fee: 0,
        },
      },
    },
  ],
} as RawPayloadResponse;

/** SUBMIT 完成帧：ver:0 同 id patch（remove 确认块 + 写 orderId） */
const submitPatchFrame = (orderId: number): RawPayloadResponse =>
  ({
    payload: [
      {
        header: {
          service: "place_order",
          id: "update-draft-order-AAPL",
          ver: 0,
          type: "patch",
        },
        body: {
          patches: [
            { op: "remove", path: "/confirmation/rows" },
            { op: "remove", path: "/confirmation/commission" },
            { op: "remove", path: "/confirmation/cost" },
            { op: "remove", path: "/confirmation/fee" },
            { op: "replace", path: "/orders/0/orderId", value: orderId },
          ],
        },
      },
    ],
  }) as RawPayloadResponse;

const submitErrorFrame: RawPayloadResponse = {
  payload: [
    {
      header: {
        service: "place_order",
        id: "update-draft-order-AAPL",
        ver: 0,
        type: "error",
      },
      body: { message: "Order rejected by upstream", isTerminal: true },
    },
  ],
} as RawPayloadResponse;

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

async function connectClient(
  url: string,
  options: RealWsJsonClientOptions = {},
) {
  const server = new WS(url, { jsonProtocol: true });
  const genericHandler = new GenericIncomingMessageHandler();
  const client = new RealWsJsonClient(
    {
      wsUrl: url,
      handshakeTimeoutMs: 0,
      heartbeatTimeoutMs: 0,
      reconnectJitterRatio: 0,
      socketFactory: (
        factoryUrl: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ): any => new (WebSocket as any)(factoryUrl),
      ...options,
    },
    undefined,
    new ResponseParser(genericHandler),
  );
  const auth = client.authenticateWithAccessToken({ accessToken });
  auth.catch(() => undefined);
  await waitFor(() => server.messages.length >= 1);
  expect(server.messages[0]).toEqual(CONNECTION_REQUEST_MESSAGE);
  server.send(connectionResponse);
  await waitFor(() => server.messages.length >= 2);
  server.send(loginResponse);
  await waitFor(() => client.isConnected());
  return { server, client, genericHandler };
}

describe("submitOrder 统一管道（跨 ver 合并出 orderId）", () => {
  afterEach(async () => {
    await jest.advanceTimersByTimeAsync(50);
    jest.useRealTimers();
    WS.clean();
    jest.restoreAllMocks();
  });

  it("confirm→submit：orderId 经统一解析管道返回，基底随后回收", async () => {
    jest.useFakeTimers();
    const { server, client, genericHandler } = await connectClient(
      `ws://localhost:${nextPort++}`,
    );
    try {
      // 1) CONFIRM：给出草稿 snapshot；基底保留（defer），
      //    SUBMIT 的 ver:0 patch 要在它上面合并。
      const confirm = client.confirmOrder(draft);
      await waitFor(() => server.messages.length >= 3);
      server.send(confirmSnapshotFrame);
      const confirmed = await confirm;
      expect(confirmed.service).toBe("place_order");
      expect(genericHandler.storeSize()).toBe(1); // CONFIRM settle 不回收基底

      // 2) SUBMIT：请求帧（ver:0 复用草稿 id）；完成帧是跨 ver patch，
      //    合并后 resolve。
      const submit = client.submitOrder(draft);
      await waitFor(() =>
        JSON.stringify(server.messages.at(-1)).includes('"action":"SUBMIT"'),
      );
      expect(server.messages.at(-1)).toEqual(
        new SubmitOrderMessageHandler().buildRequest(draft),
      );
      server.send(submitPatchFrame(5411072868));
      const placed = await submit;

      // 门面契约：body.orderId 顶层可见
      expect(placed.service).toBe("place_order");
      expect(placed.id).toBe("update-draft-order-AAPL");
      expect((placed.body as { orderId?: unknown }).orderId).toBe(5411072868);
      // submit settle：草稿基底回收
      expect(genericHandler.storeSize()).toBe(0);
    } finally {
      client.disconnect();
    }
  });

  it("placeOrder 两步端到端（confirm snapshot → submit 跨 ver patch）", async () => {
    jest.useFakeTimers();
    const { server, client } = await connectClient(
      `ws://localhost:${nextPort++}`,
    );
    try {
      const placed = client.placeOrder(draft);
      await waitFor(() => server.messages.length >= 3);
      server.send(confirmSnapshotFrame);
      await waitFor(() =>
        JSON.stringify(server.messages.at(-1)).includes('"action":"SUBMIT"'),
      );
      server.send(submitPatchFrame(5411080790));
      const result = await placed;
      expect((result.body as { orderId?: unknown }).orderId).toBe(5411080790);
    } finally {
      client.disconnect();
    }
  });

  it("SUBMIT 完成帧前先到的价格 patch 不算终态（isFinal 判据）", async () => {
    jest.useFakeTimers();
    const { server, client } = await connectClient(
      `ws://localhost:${nextPort++}`,
    );
    try {
      const confirm = client.confirmOrder(draft);
      await waitFor(() => server.messages.length >= 3);
      server.send(confirmSnapshotFrame);
      await confirm;

      const submit = client.submitOrder(draft);
      await waitFor(() =>
        JSON.stringify(server.messages.at(-1)).includes('"action":"SUBMIT"'),
      );
      // SUBMIT 之后服务端可能先推 ver:1 价格 patch（limitPrice 注入）：
      // 合并进基底但无 orderId，不得提前 resolve。
      server.send({
        payload: [
          {
            header: {
              service: "place_order",
              id: "update-draft-order-AAPL",
              ver: 1,
              type: "patch",
            },
            body: {
              patches: [
                { op: "replace", path: "/orders/0/limitPrice", value: 340.95 },
              ],
            },
          },
        ],
      } as RawPayloadResponse);
      await jest.advanceTimersByTimeAsync(10);
      let settled = false;
      void submit.then(() => {
        settled = true;
      });
      await jest.advanceTimersByTimeAsync(10);
      expect(settled).toBe(false);

      server.send(submitPatchFrame(5411099999));
      const placed = await submit;
      expect((placed.body as { orderId?: unknown }).orderId).toBe(5411099999);
      // 中间帧已合并进基底：完成帧透出的是完整演进后的文档
      const orders = (placed.body as { orders: { limitPrice: number }[] })
        .orders;
      expect(orders[0].limitPrice).toBe(340.95);
    } finally {
      client.disconnect();
    }
  });

  it("SUBMIT 错误帧：统一管道以 WebSocketApiError reject", async () => {
    jest.useFakeTimers();
    const { server, client, genericHandler } = await connectClient(
      `ws://localhost:${nextPort++}`,
    );
    try {
      const confirm = client.confirmOrder(draft);
      await waitFor(() => server.messages.length >= 3);
      server.send(confirmSnapshotFrame);
      await confirm;

      const submit = client.submitOrder(draft);
      await waitFor(() =>
        JSON.stringify(server.messages.at(-1)).includes('"action":"SUBMIT"'),
      );
      server.send(submitErrorFrame);
      await expect(submit).rejects.toThrow(
        new WebSocketApiError("Order rejected by upstream", {
          service: "place_order",
          requestId: "update-draft-order-AAPL",
          isTerminal: true,
        }),
      );
      // 错误 settle 同样回收草稿基底
      expect(genericHandler.storeSize()).toBe(0);
    } finally {
      client.disconnect();
    }
  });
});
