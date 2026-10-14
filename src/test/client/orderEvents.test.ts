import WS from "jest-websocket-mock";
import {
  CONNECTION_REQUEST_MESSAGE,
  RealWsJsonClient,
  RealWsJsonClientOptions,
} from "../../client/realWsJsonClient";
import ResponseParser from "../../client/responseParser";
import GenericIncomingMessageHandler from "../../client/services/genericIncomingMessageHandler";
import OrderEventsMessageHandler, {
  DEFAULT_ORDER_EVENT_TYPES,
  NormalizedOrderEvent,
  RawOrderEvent,
  normalizeOrderEvent,
  normalizeOrderStatus,
} from "../../client/services/orderEventsMessageHandler";
import SubscribeToAlertMessageHandler, {
  DEFAULT_ALERT_TYPES,
} from "../../client/services/subscribeToAlertMessageHandler";
import WorkingOrdersMessageHandler from "../../client/services/workingOrdersMessageHandler";
import { ParsedPayloadResponse } from "../../client/tdaWsJsonTypes";

/**
 * task-14A/B/C：order_events 门面（原始流 + 归一化）、alerts/subscribe
 * iterable、workingOrders 查表派发。全 mock（jest-websocket-mock），无网络。
 */

// ---- A) 归一化纯函数（状态映射表逐一对齐前端 bundle 的 cp()） ----

describe("normalizeOrderStatus（wire status → 归一枚举）", () => {
  it.each([
    // WORKING 家族（前端 cp 的 switch 分组）
    ["WORKING", "WORKING"],
    ["ACCEPTED", "WORKING"],
    ["QUEUED", "WORKING"],
    ["PENDING_ACKNOWLEDGEMENT", "WORKING"],
    ["AWAITING_PARENT_ORDER", "WORKING"],
    ["AWAITING_CONDITION", "WORKING"],
    ["AWAITING_UR_OUT", "WORKING"],
    ["PENDING_ACTIVATION", "WORKING"],
    ["PENDING", "WORKING"],
    ["CANCELING", "WORKING"],
    ["PENDING_CANCEL", "WORKING"],
    ["PENDING CANCEL", "WORKING"],
    ["REPLACING", "WORKING"],
    ["PENDING_REPLACE", "WORKING"],
    ["PENDING REPLACE", "WORKING"],
    ["PENDING_RECALL", "WORKING"],
    ["SUBMITTING", "WORKING"],
    // 等待家族（空格/下划线两种线格式）
    ["WAIT TRG", "WAIT_TRG"],
    ["WAIT_TRG", "WAIT_TRG"],
    ["WAIT STOP", "WAIT_STOP"],
    ["WAIT_STOP", "WAIT_STOP"],
    ["WAIT COND", "WAIT_COND"],
    ["WAIT_COND", "WAIT_COND"],
    ["WAIT REV", "WAIT_REV"],
    ["WAIT_REV", "WAIT_REV"],
    // 终态
    ["CANCELED", "CANCELED"],
    ["CANCEL_SUCCESS", "CANCELED"],
    ["DONE", "CANCELED"],
    ["NOT SENT", "CANCELED"],
    ["NOT_SENT", "CANCELED"],
    ["REPLACED", "CANCELED"],
    ["EXPIRED", "EXPIRED"],
    ["REJECTED", "REJECTED"],
    ["FILLED", "FILLED"],
  ] as const)("wire %s → %s", (raw, expected) => {
    expect(normalizeOrderStatus(raw)).toBe(expected);
  });

  it("大小写不敏感 + 子串嗅探兜底（bundle cp 的 default 分支）", () => {
    expect(normalizeOrderStatus("working")).toBe("WORKING");
    expect(normalizeOrderStatus("partially_working")).toBe("WORKING");
    expect(normalizeOrderStatus("PARTIALLY_FILLED")).toBe("FILLED");
    expect(normalizeOrderStatus("already_expired")).toBe("EXPIRED");
    expect(normalizeOrderStatus("USER_CANCELED")).toBe("CANCELED");
  });

  it("未识别值归 NONE（开放集合不丢事件）", () => {
    expect(normalizeOrderStatus("SOMETHING_NEW")).toBe("NONE");
    expect(normalizeOrderStatus("")).toBe("NONE");
  });
});

const rawEvent = (overrides: Partial<RawOrderEvent>): RawOrderEvent =>
  ({
    eventType: "WORKING",
    eventTime: 1791927663429,
    orderId: 5411072868,
    refOrderId: 0,
    triggerOrderId: 0,
    executionId: 0,
    orderTime: "2026-10-13T21:42:00.982Z",
    description: "BUY 1 AAPL",
    descriptionToShare: "",
    accountCode: "IND-D100579QZ",
    status: "ACCEPTED",
    tag: "TOSWeb",
    side: "BUY",
    taxLotMethod: "FIFO",
    orderType: "LIMIT",
    tif: "DAY",
    exchange: "BEST",
    spreadName: "STOCK",
    sellOut: false,
    quantity: 1,
    filledQuantity: 0,
    limitPrice: 340.9,
    priceType: "@1.00 LMT",
    price: 340.9,
    cost: 340.9,
    groupId: 0,
    groupMarker: "",
    unionId: 0,
    cancelable: true,
    replaceable: true,
    exercise: false,
    similarAllowed: false,
    oppositeAllowed: false,
    underlyingSymbol: "AAPL",
    underlyingType: "EQUITY",
    rootSymbol: "AAPL",
    compositeSymbol: "AAPL",
    legs: [],
    legsDescription: "AAPL",
    legsDescriptionDisplay: "AAPL",
    ...overrides,
  }) as RawOrderEvent;

describe("normalizeOrderEvent（wire 事件 → 归一事件）", () => {
  it("字段映射：status 归一 + rawStatus 保留 + symbol 取 composite", () => {
    const normalized = normalizeOrderEvent(
      rawEvent({ status: "PENDING_ACKNOWLEDGEMENT" }),
    );
    expect(normalized).toEqual({
      orderId: 5411072868,
      eventType: "WORKING",
      status: "WORKING",
      rawStatus: "PENDING_ACKNOWLEDGEMENT",
      symbol: "AAPL",
      quantity: 1,
      filledQuantity: 0,
      side: "BUY",
      orderType: "LIMIT",
      tif: "DAY",
      price: 340.9,
      limitPrice: 340.9,
      accountCode: "IND-D100579QZ",
      description: "BUY 1 AAPL",
      eventTime: 1791927663429,
    });
  });

  it("symbol 回退链 composite→underlying→root；可选键缺省不输出", () => {
    const noComposite = normalizeOrderEvent(
      rawEvent({
        compositeSymbol: undefined as unknown as string,
        stopPrice: 300,
        avgFillPrice: 301.5,
      }),
    );
    expect(noComposite.symbol).toBe("AAPL");
    expect(noComposite.stopPrice).toBe(300);
    expect(noComposite.avgFillPrice).toBe(301.5);

    const bare = normalizeOrderEvent({
      eventType: "EXECUTION",
      orderId: 7,
      status: "FILLED",
      quantity: 2,
      filledQuantity: 2,
      rootSymbol: "MSFT",
      eventTime: 1,
    } as unknown as RawOrderEvent);
    expect(bare.symbol).toBe("MSFT");
    expect(bare.status).toBe("FILLED");
    // side/orderType/price 等缺省时不出现
    expect("side" in bare).toBe(false);
    expect("stopPrice" in bare).toBe(false);
  });

  it("部分成交：status 保持 WORKING，fills 走 filledQuantity（wire 无 PARTIAL 态）", () => {
    const part = normalizeOrderEvent(
      rawEvent({
        eventType: "EXECUTION",
        status: "WORKING",
        filledQuantity: 1,
      }),
    );
    expect(part.status).toBe("WORKING");
    expect(part.filledQuantity).toBe(1);
  });
});

// ---- 客户端集成：orderEvents / observeOrders / subscribeAlerts / workingOrders ----

const ORDER_EVENTS_URL = "ws://localhost:9912";
const ALERTS_URL = "ws://localhost:9913";
const accessToken = "test-access-token";

const connectionResponse = {
  session: "17a7_t14",
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

function setup(
  url: string,
  options: Partial<RealWsJsonClientOptions> = {},
): { server: WS; client: RealWsJsonClient } {
  const server = new WS(url, { jsonProtocol: true });
  const socketFactory = (
    factoryUrl: string,
    _headers: Record<string, string>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any => new (WebSocket as any)(factoryUrl);
  const client = new RealWsJsonClient(
    {
      wsUrl: url,
      handshakeTimeoutMs: 0,
      heartbeatTimeoutMs: 0,
      reconnectJitterRatio: 0,
      autoUnsubscribe: false,
      socketFactory,
      ...options,
    },
    undefined,
    new ResponseParser(new GenericIncomingMessageHandler()),
  );
  return { server, client };
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

function collect<T>(iterable: AsyncIterable<T>, sink: T[]): void {
  void (async () => {
    for await (const msg of iterable) {
      sink.push(msg);
    }
  })();
}

const orderEventsFrame = (orders: RawOrderEvent[]) => ({
  payload: [
    {
      header: {
        service: "order_events",
        id: "order_events",
        ver: 0,
        type: "snapshot",
      },
      body: { orders },
    },
  ],
});

describe("RealWsJsonClient.orderEvents / observeOrders（task-14A）", () => {
  afterEach(async () => {
    await jest.advanceTimersByTimeAsync(50);
    jest.useRealTimers();
    WS.clean();
    jest.restoreAllMocks();
  });

  it("orderEvents 发出线上实测形状的订阅帧（id=order_events + 默认 types）", async () => {
    jest.useFakeTimers();
    const { server, client } = setup(ORDER_EVENTS_URL);
    try {
      await completeHandshake(server, client);
      const received: ParsedPayloadResponse[] = [];
      collect(client.orderEvents({ account: "IND-D100579QZ" }), received);
      await waitFor(() => server.messages.length >= 3);
      expect(server.messages[2]).toEqual(
        new OrderEventsMessageHandler().buildRequest({
          account: "IND-D100579QZ",
        }),
      );
      // 与前端线上请求帧一致（watch2-console.txt +23.73s）
      expect(
        (
          server.messages[2] as {
            payload: { params: { types: string[] } }[];
          }
        ).payload[0].params.types,
      ).toEqual(DEFAULT_ORDER_EVENT_TYPES);
    } finally {
      client.disconnect();
    }
  });

  it("原始流透传 body.orders[]；observeOrders 逐条展平并归一 status", async () => {
    jest.useFakeTimers();
    const { server, client } = setup(ORDER_EVENTS_URL);
    try {
      await completeHandshake(server, client);
      const raw: ParsedPayloadResponse[] = [];
      const normalized: NormalizedOrderEvent[] = [];
      collect(client.orderEvents({ account: "ACC" }), raw);
      collect(client.observeOrders("ACC"), normalized);
      await waitFor(() => server.messages.length >= 3);

      // 一帧两条事件（snapshot 批量是 wire 常态）
      server.send(
        orderEventsFrame([
          rawEvent({ status: "ACCEPTED" }),
          rawEvent({
            eventType: "EXECUTION",
            status: "FILLED",
            filledQuantity: 1,
            avgFillPrice: 340.9,
          }),
        ]),
      );
      await waitFor(() => normalized.length >= 2);
      expect(raw[0].service).toBe("order_events");
      expect(
        (raw[0].body as { orders: RawOrderEvent[] }).orders.map(
          (o) => o.status,
        ),
      ).toEqual(["ACCEPTED", "FILLED"]);
      expect(normalized.map((e) => e.status)).toEqual(["WORKING", "FILLED"]);
      expect(normalized.map((e) => e.rawStatus)).toEqual([
        "ACCEPTED",
        "FILLED",
      ]);
      expect(normalized[1].avgFillPrice).toBe(340.9);

      // 后续 patch 合并快照继续流入同一条流
      server.send(
        orderEventsFrame([
          rawEvent({ status: "CANCELED", eventType: "FINAL" }),
        ]),
      );
      await waitFor(() => normalized.length >= 3);
      expect(normalized[2].status).toBe("CANCELED");
    } finally {
      client.disconnect();
    }
  });

  it("workingOrders 改查表派发后 wire 帧不变（id=workingOrders, types=[WORKING]）", async () => {
    jest.useFakeTimers();
    const { server, client } = setup(ORDER_EVENTS_URL);
    try {
      await completeHandshake(server, client);
      const received: ParsedPayloadResponse[] = [];
      collect(client.workingOrders("ACC"), received);
      await waitFor(() => server.messages.length >= 3);
      expect(server.messages[2]).toEqual(
        new WorkingOrdersMessageHandler().buildRequest("ACC"),
      );
    } finally {
      client.disconnect();
    }
  });
});

describe("RealWsJsonClient.subscribeAlerts（task-14B）", () => {
  afterEach(async () => {
    await jest.advanceTimersByTimeAsync(50);
    jest.useRealTimers();
    WS.clean();
    jest.restoreAllMocks();
  });

  it("缺省 alertTypes 发出 alerts/subscribe 订阅帧并收到推送", async () => {
    jest.useFakeTimers();
    const { server, client } = setup(ALERTS_URL);
    try {
      await completeHandshake(server, client);
      const received: ParsedPayloadResponse[] = [];
      collect(client.subscribeAlerts(), received);
      await waitFor(() => server.messages.length >= 3);
      expect(server.messages[2]).toEqual(
        new SubscribeToAlertMessageHandler().buildRequest(DEFAULT_ALERT_TYPES),
      );
      server.send({
        payload: [
          {
            header: {
              service: "alerts/subscribe",
              id: "alerts_subscribe",
              ver: 0,
              type: "snapshot",
            },
            body: {
              type: "TRIGGERED_ALERT",
              alertId: 25611753,
            },
          },
        ],
      });
      await waitFor(() => received.length >= 1);
      expect(received[0].body).toEqual({
        type: "TRIGGERED_ALERT",
        alertId: 25611753,
      });
    } finally {
      client.disconnect();
    }
  });

  it("显式 alertTypes 原样进帧", async () => {
    jest.useFakeTimers();
    const { server, client } = setup(ALERTS_URL);
    try {
      await completeHandshake(server, client);
      collect(client.subscribeAlerts(["TRIGGERED_ALERT"]), []);
      await waitFor(() => server.messages.length >= 3);
      expect(
        (
          server.messages[2] as {
            payload: { params: { alertTypes: string[] } }[];
          }
        ).payload[0].params.alertTypes,
      ).toEqual(["TRIGGERED_ALERT"]);
    } finally {
      client.disconnect();
    }
  });
});
