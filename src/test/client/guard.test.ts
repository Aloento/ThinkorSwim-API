import WS from "jest-websocket-mock";
import {
  CONNECTION_REQUEST_MESSAGE,
  PAPER_WS_URL,
  RealWsJsonClient,
  RealWsJsonClientOptions,
} from "../../client/realWsJsonClient";
import { GuardError, OrderGuard } from "../../client/guard";
import ResponseParser from "../../client/responseParser";
import GenericIncomingMessageHandler from "../../client/services/genericIncomingMessageHandler";
import { PlaceLimitOrderRequestParams } from "../../client/services/placeOrderMessageHandler";
import { ReplaceOrderRequestParams } from "../../client/services/submitOrderMessageHandler";

/**
 * guard 安全闸门拦截矩阵。默认（未配置 guard）零行为变化；
 * 命中规则以 Promise rejection（GuardError）报告——与写门面的 Promise
 * 语义一致，且失败发生在 sendMessage 之前（server 收不到任何帧）。
 *
 * paperOnly 的判定源是 **选项里的 wsUrl 字符串**（是否含
 * papermoney-services），与 socketFactory 实际路由到哪个 mock 端口无关，
 * 因此模拟盘用例可让工厂把连接路由到本地 mock、wsUrl 保持真实 PAPER 端点。
 */

const accessToken = "test-access-token";
let nextPort = 9920;

const connectionResponse = {
  session: "17a7_guard",
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

function makeClient(
  url: string,
  options: Partial<RealWsJsonClientOptions> = {},
): RealWsJsonClient {
  return new RealWsJsonClient(
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
    new ResponseParser(new GenericIncomingMessageHandler()),
  );
}

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

async function completeHandshake(server: WS, client: RealWsJsonClient) {
  const auth = client.authenticateWithAccessToken({ accessToken });
  auth.catch(() => undefined);
  await waitFor(() => server.messages.length >= 1);
  expect(server.messages[0]).toEqual(CONNECTION_REQUEST_MESSAGE);
  server.send(connectionResponse);
  await waitFor(() => server.messages.length >= 2);
  server.send(loginResponse);
  await waitFor(() => client.isConnected());
}

/** 每个用例独立端口 + 独立 server/client，握手后 server 恰好 2 帧 */
async function connected(
  options: Partial<RealWsJsonClientOptions> = {},
): Promise<{
  server: WS;
  client: RealWsJsonClient;
  url: string;
}> {
  const url = `ws://localhost:${nextPort++}`;
  const server = new WS(url, { jsonProtocol: true });
  const client = makeClient(url, options);
  await completeHandshake(server, client);
  return { server, client, url };
}

const limitDraft: PlaceLimitOrderRequestParams = {
  accountNumber: "IND-D100579QZ",
  symbol: "AAPL",
  quantity: 1,
  limitPrice: 340.9,
};

const marketDraft: PlaceLimitOrderRequestParams = {
  accountNumber: "IND-D100579QZ",
  symbol: "AAPL",
  quantity: 5,
  orderType: "MARKET",
};

const replaceDraft: ReplaceOrderRequestParams = {
  ...limitDraft,
  refOrderId: 5411072868,
};

describe("guard 安全闸门（拦截矩阵）", () => {
  afterEach(async () => {
    await jest.advanceTimersByTimeAsync(50);
    jest.useRealTimers();
    WS.clean();
    jest.restoreAllMocks();
  });

  it("默认不启用：confirmOrder 正常发出 place_order 帧", async () => {
    jest.useFakeTimers();
    const { server, client } = await connected();
    try {
      void client.confirmOrder(limitDraft).catch(() => undefined);
      await waitFor(() => server.messages.length >= 3);
      expect(JSON.stringify(server.messages[2]).includes("place_order")).toBe(
        true,
      );
    } finally {
      client.disconnect();
    }
  });

  it("paperOnly + 真实盘会话：confirm/submit/replace/cancel 全拒，wire 零帧", async () => {
    jest.useFakeTimers();
    const { server, client } = await connected({
      guard: { paperOnly: true },
    });
    try {
      await expect(client.confirmOrder(limitDraft)).rejects.toThrow(GuardError);
      await expect(client.submitOrder(limitDraft)).rejects.toThrow(
        /paperOnly.*papermoney-services/,
      );
      await expect(client.replaceOrder(replaceDraft)).rejects.toThrow(
        /replaceOrder/,
      );
      await expect(client.cancelOrder(1)).rejects.toThrow(/cancelOrder/);
      // 关键：闸门在任何 wire 帧发出前拦截——握手 2 帧之后 server 一无所收
      expect(server.messages.length).toBe(2);
    } finally {
      client.disconnect();
    }
  });

  it("paperOnly + 模拟盘端点（PAPER_WS_URL）：放行写单", async () => {
    jest.useFakeTimers();
    // wsUrl=真实 PAPER 端点字符串（paperOnly 判定源）；工厂把连接路由到
    // 本地 mock——wsUrl 字符串与实际 TCP 目标解耦是本测试的关键手法。
    const url = `ws://localhost:${nextPort++}`;
    const server = new WS(url, { jsonProtocol: true });
    const client = makeClient(PAPER_WS_URL, {
      socketFactory: () =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new (WebSocket as any)(url) as WebSocket,
      guard: { paperOnly: true },
    });
    try {
      await completeHandshake(server, client);
      void client.confirmOrder(limitDraft).catch(() => undefined);
      await waitFor(() => server.messages.length >= 3);
      expect(JSON.stringify(server.messages[2]).includes("place_order")).toBe(
        true,
      );
    } finally {
      client.disconnect();
    }
  });

  it("allowedAccountCodes：名单外拒绝（报错含方法名），名单内放行", async () => {
    jest.useFakeTimers();
    const { server, client } = await connected({
      guard: { allowedAccountCodes: ["IND-OTHER"] },
    });
    try {
      await expect(client.confirmOrder(limitDraft)).rejects.toThrow(
        /confirmOrder.*allowedAccountCodes/,
      );
      await expect(client.submitOrder(limitDraft)).rejects.toThrow(
        /submitOrder.*allowedAccountCodes/,
      );
      // 名单内账户放行
      void client
        .confirmOrder({ ...limitDraft, accountNumber: "IND-OTHER" })
        .catch(() => undefined);
      await waitFor(() =>
        JSON.stringify(server.messages.at(-1)).includes("place_order"),
      );
    } finally {
      client.disconnect();
    }
  });

  it("maxQuantity/maxNotionalUsd：超限拒绝；MARKET 名义金额不可知保守拒绝；达标放行", async () => {
    jest.useFakeTimers();
    const { server, client } = await connected({
      guard: { maxQuantity: 10, maxNotionalUsd: 1000 },
    });
    try {
      // |qty| 超限（买/卖都拦）
      await expect(
        client.replaceOrder({ ...replaceDraft, quantity: 11 }),
      ).rejects.toThrow(/maxQuantity/);
      await expect(
        client.replaceOrder({ ...replaceDraft, quantity: -11 }),
      ).rejects.toThrow(/maxQuantity/);
      // 名义金额超限：1×340.9 达标，3×340.9=1022.7 > 1000
      await expect(
        client.replaceOrder({ ...replaceDraft, quantity: 3 }),
      ).rejects.toThrow(/maxNotionalUsd/);
      // MARKET 无 limitPrice 也无 notionalUsd → 名义金额不可知，保守拒绝
      await expect(client.submitOrder(marketDraft)).rejects.toThrow(
        /neither notionalUsd nor limitPrice/,
      );
      // 达标（2×340.9=681.8 ≤1000，|qty|≤10）→ 放行
      void client
        .replaceOrder({ ...replaceDraft, quantity: 2 })
        .catch(() => undefined);
      await waitFor(() =>
        JSON.stringify(server.messages.at(-1)).includes("place_order"),
      );
    } finally {
      client.disconnect();
    }
  });

  it("notional（碎股名义额）矩阵：美元额可知即按 USD 校验，不再要求 limitPrice", () => {
    // 与 afterEach 的假定时器推进对齐（纯断言用例，同 GuardError 用例做法）
    jest.useFakeTimers();
    // 直接测 OrderGuard 语义：notionalUsd 是纯闸门输入（美元额=下单意图），
    // 与 wire 形状无关——AMOUNT 的 wire 类型待 W11 录帧后另加。
    const guard = new OrderGuard(
      { maxQuantity: 50, maxNotionalUsd: 800 },
      true,
    );
    // 碎股名义额买单的闸门视图：quantity 传 CONFIRM 回读的估算股数（碎股），
    // notionalUsd 传下单意图的美元额。
    const fractional = (usd: number, estQty = 0.0146) => ({
      symbol: "AAPL",
      accountNumber: "IND-D100579QZ",
      quantity: estQty,
      notionalUsd: usd,
    });
    // 美元额超限 → 拒（与 qty 无关）
    expect(() => guard.validateOrder("submitOrder", fractional(900))).toThrow(
      /maxNotionalUsd/,
    );
    // 美元额达标 + 估算股数超 maxQuantity → 拒（两条规则都还要起作用）
    expect(() => guard.validateOrder("submitOrder", fractional(5, 51))).toThrow(
      /maxQuantity/,
    );
    // 达标：$1.65 碎股买（碎股 qty，无 limitPrice）→ 放行
    // （旧实现会因"无 limitPrice"一律误拒，碎股定投走不通）
    expect(() =>
      guard.validateOrder("submitOrder", fractional(1.65)),
    ).not.toThrow();
    // 负数美元额按绝对值校验（$-900 与 $900 同等被拦）
    expect(() => guard.validateOrder("submitOrder", fractional(-900))).toThrow(
      /maxNotionalUsd/,
    );
    // notionalUsd 与 limitPrice 并存：notionalUsd 优先（美元额是更精确口径）
    expect(() =>
      guard.validateOrder("submitOrder", {
        ...fractional(5),
        limitPrice: 340.9,
      }),
    ).not.toThrow();
    // 两者皆无（纯 MARKET 股数单）仍保守拒绝
    expect(() =>
      guard.validateOrder("submitOrder", {
        symbol: "AAPL",
        accountNumber: "IND-D100579QZ",
        quantity: 5,
      }),
    ).toThrow(/neither notionalUsd nor limitPrice/);
  });

  it("GuardError 是 Error 子类且 name=GuardError", () => {
    // 假定时器与 afterEach 对齐（纯断言用例，定时器不推进也无妨）
    jest.useFakeTimers();
    const err = new GuardError("nope");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("GuardError");
    expect(err.message).toBe("nope");
  });
});
