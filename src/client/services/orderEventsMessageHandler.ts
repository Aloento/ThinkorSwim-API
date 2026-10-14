import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

export type OrderEvent = {
  id: number;
  symbol: string;
  status: string;
  quantity: number;
  price: number;
  orderType: string;
  side: "BUY" | "SELL";
  description: string;
  orderDateTime: Date;
  cancelable: boolean;
  underlyingType: string;
};

export type RawOrderEvent = {
  eventType: string;
  eventTime: number;
  orderId: number;
  refOrderId: number;
  triggerOrderId: number;
  executionId: number;
  orderTime: string;
  description: string;
  descriptionToShare: string;
  accountCode: string;
  status: string;
  tag: string;
  side: "BUY" | "SELL";
  taxLotMethod: string;
  orderType: string;
  tif: string;
  exchange: string;
  spreadName: string;
  sellOut: boolean;
  quantity: number;
  filledQuantity: number;
  limitPrice: number;
  /** 止损价（bundle zod schema 为可选键，仅止损类事件携带） */
  stopPrice?: number;
  priceType: string;
  price: number;
  /** 均价成交（bundle zod schema 为可选键，成交类事件携带） */
  avgFillPrice?: number;
  cost: number;
  groupId: number;
  groupMarker: string;
  unionId: number;
  cancelable: boolean;
  replaceable: boolean;
  exercise: boolean;
  similarAllowed: boolean;
  oppositeAllowed: boolean;
  underlyingSymbol: string;
  underlyingType: string;
  rootSymbol: string;
  compositeSymbol: string;
  legs: {
    symbol: string;
    positionEffect: string;
    quantity: number;
    instrumentType: string;
  }[];
  legsDescription: string;
  legsDescriptionDisplay: string;
};

export type OrderEventsSnapshotResponse = {
  orders: OrderEvent[];
  service: "order_events";
};

/**
 * order_events 订阅参数。types 缺省取前端实测集合
 * （线上实测）。
 */
export type OrderEventsRequestParams = {
  account: string;
  types?: string[];
};

export const DEFAULT_ORDER_EVENT_TYPES = [
  "WORKING",
  "QUEUED",
  "FILLED",
  "CANCELED",
  "FINAL",
  "EXECUTION",
];

/**
 * 归一化订单状态。取值直接取网页版前端自带状态枚举（前端 bundle 的
 * mn 枚举：FILLED/REJECTED/CANCELED/WORKING/EXPIRED/
 * "WAIT TRG"/"WAIT STOP"/"WAIT COND"/"WAIT REV"/NONE），枚举成员改用
 * 下划线写法。
 *
 * 取值来源：前端 bundle 官方归一化函数（20 个 raw wire 值 → 10 个
 * 归一值）；order_history 线上实测帧的 "CANCELED" 与之吻合。注意前端词表没有 "PARTIAL"：部分成交经
 * eventType=EXECUTION + filledQuantity 表达，status 仍 WORKING。
 */
export type NormalizedOrderStatus =
  | "WORKING"
  | "WAIT_TRG"
  | "WAIT_STOP"
  | "WAIT_COND"
  | "WAIT_REV"
  | "CANCELED"
  | "EXPIRED"
  | "REJECTED"
  | "FILLED"
  | "NONE";

/** 归一化后的订单事件（observeOrders 的载荷；rawStatus 保留 wire 原值）。 */
export type NormalizedOrderEvent = {
  orderId: number;
  /** wire 原 eventType：WORKING/FINAL/FILLED/EXECUTION/...（前端 bundle zod schema） */
  eventType: string;
  status: NormalizedOrderStatus;
  rawStatus: string;
  symbol: string;
  quantity: number;
  filledQuantity: number;
  side?: "BUY" | "SELL";
  orderType?: string;
  tif?: string;
  price?: number;
  limitPrice?: number;
  stopPrice?: number;
  avgFillPrice?: number;
  accountCode?: string;
  description?: string;
  eventTime: number;
};

/**
 * wire status → 归一化状态。switch 分支逐一复刻前端 bundle 的 cp()
 * （frontend-index.js），default 分支保留其子串嗅探兜底（*WORKING* /
 * *FILLED* / *EXPIRED* / *CANCELED*），未识别值归 NONE 而非抛错——
 * 服务端状态词是开放集合，归一化层不丢事件。
 */
export function normalizeOrderStatus(status: string): NormalizedOrderStatus {
  const s = (status ?? "").toUpperCase();
  switch (s) {
    case "PENDING_ACKNOWLEDGEMENT":
    case "AWAITING_PARENT_ORDER":
    case "AWAITING_CONDITION":
    case "AWAITING_UR_OUT":
    case "PENDING_ACTIVATION":
    case "WORKING":
    case "ACCEPTED":
    case "QUEUED":
    case "PENDING":
    case "CANCELING":
    case "PENDING_CANCEL":
    case "PENDING CANCEL":
    case "REPLACING":
    case "PENDING_REPLACE":
    case "PENDING REPLACE":
    case "PENDING_RECALL":
    case "SUBMITTING":
      return "WORKING";
    case "WAIT TRG":
    case "WAIT_TRG":
      return "WAIT_TRG";
    case "WAIT STOP":
    case "WAIT_STOP":
      return "WAIT_STOP";
    case "WAIT COND":
    case "WAIT_COND":
      return "WAIT_COND";
    case "WAIT REV":
    case "WAIT_REV":
      return "WAIT_REV";
    case "CANCELED":
    case "CANCEL_SUCCESS":
    case "DONE":
    case "NOT SENT":
    case "NOT_SENT":
    case "REPLACED":
      return "CANCELED";
    case "EXPIRED":
      return "EXPIRED";
    case "REJECTED":
      return "REJECTED";
    case "FILLED":
      return "FILLED";
    default:
      if (s.includes("WORKING")) return "WORKING";
      if (s.includes("FILLED")) return "FILLED";
      if (s.includes("EXPIRED")) return "EXPIRED";
      if (s.includes("CANCELED")) return "CANCELED";
      return "NONE";
  }
}

/** 单条 wire 事件 → 归一化事件。symbol 取 composite→underlying→root 链。 */
export function normalizeOrderEvent(raw: RawOrderEvent): NormalizedOrderEvent {
  return {
    orderId: raw.orderId,
    eventType: raw.eventType,
    status: normalizeOrderStatus(raw.status),
    rawStatus: raw.status,
    symbol:
      raw.compositeSymbol ??
      raw.underlyingSymbol ??
      raw.rootSymbol ??
      raw.spreadName ??
      "",
    quantity: raw.quantity ?? 0,
    filledQuantity: raw.filledQuantity ?? 0,
    ...(raw.side !== undefined ? { side: raw.side } : {}),
    ...(raw.orderType !== undefined ? { orderType: raw.orderType } : {}),
    ...(raw.tif !== undefined ? { tif: raw.tif } : {}),
    ...(raw.price !== undefined ? { price: raw.price } : {}),
    ...(raw.limitPrice !== undefined ? { limitPrice: raw.limitPrice } : {}),
    ...(raw.stopPrice !== undefined ? { stopPrice: raw.stopPrice } : {}),
    ...(raw.avgFillPrice !== undefined
      ? { avgFillPrice: raw.avgFillPrice }
      : {}),
    ...(raw.accountCode !== undefined ? { accountCode: raw.accountCode } : {}),
    ...(raw.description !== undefined ? { description: raw.description } : {}),
    eventTime: raw.eventTime ?? 0,
  };
}

/**
 * order_events 订阅：
 * 服务端在订单状态变化时持续推送 snapshot{orders[]}，header.id 固定为
 * "order_events"（线上实测帧）。重连后随 activeRequests 原样重放。
 */
export default class OrderEventsMessageHandler implements WebSocketApiMessageHandler<OrderEventsRequestParams> {
  buildRequest(request: OrderEventsRequestParams): RawPayloadRequest {
    const { account, types = DEFAULT_ORDER_EVENT_TYPES } = request;
    return newPayload({
      header: { service: "order_events", id: "order_events", ver: 0 },
      params: { account, types },
    });
  }

  service: ApiService = "order_events";
}
