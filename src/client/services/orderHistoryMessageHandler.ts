import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// orderEntryFields 可用枚举（服务端错误帧自曝 "Possible enum values are [...]"）。
// 发送集合外的值会导致整条请求报 error。
const ORDER_ENTRY_FIELDS = [
  "TIME_PLACED",
  "ORDER_ID",
  "REF_ORDER_ID",
  "TRIGGER_ORDER_ID",
  "SYMBOL",
  "DISPLAY_SYMBOL",
  "UNDERLYING_SYMBOL",
  "UNDERLYING_DISPLAY_SYMBOL",
  "ROOT_SYMBOL",
  "ROOT_DISPLAY_SYMBOL",
  "ORDER_TYPE",
  "TIF",
  "EXCHANGE",
  "QTY",
  "QTY_LINK",
  "QTY_OFFSET",
  "QTY_FILLED",
  "SPREAD",
  "LIMIT_PRICE",
  "LIMIT_PRICE_LINK",
  "LIMIT_PRICE_OFFSET",
  "STOP_PRICE",
  "STOP_PRICE_LINK",
  "STOP_PRICE_OFFSET",
  "STOP_TYPE",
  "WALK_LIMIT_START_PRICE",
  "WALK_LIMIT_END_PRICE",
  "WALK_LIMIT_PRICE_INCR",
  "WALK_LIMIT_TIME_INCR",
  "SIDE",
  "STATUS",
  "IS_SELLOUT",
  "IS_CANCELABLE",
  "IS_REPLACEABLE",
  "IS_EXERCISE",
  "ORDER_GROUPS",
  "GROUP_ID",
  "TRIGGER_CONDITIONS",
  "CANCEL_CONDITIONS",
  "TRIGGER_TIME",
  "CANCEL_TIME",
  "SPECIAL_INSTRUCTION",
  "PRICE_TYPE",
  "PRICE_IMPROVEMENT",
  "COST",
  "DESC",
  "DESC_TO_SHARE",
  "COMMENT",
] as const;

export type OrderHistoryEntryField = (typeof ORDER_ENTRY_FIELDS)[number];

// 服务端校验：
//  - 必须提供 startTime+endTime 时间对，或 orderId；
//  - orderEntryFields 与 legFields 至少一个非空；
//  - 窗口 ≤ 370 天（含两端），startTime 不得晚于当前时间；
//  - account 必须是真实账户 code（如 "D-XXXXXXXX"）；
//    "COMBINED ACCOUNT" 报 "Invalid account number"。
export type OrderHistoryRequestParams = {
  account: string;
  // epoch **秒**（非毫秒），窗口 ≤ 370 天
  startTime: number;
  endTime: number;
  orderEntryFields: OrderHistoryEntryField[];
  // legFields 形状未确认；需要时按 orderEntryFields 同样方式传。
  legFields?: unknown[];
};

// 响应条目字段随请求 orderEntryFields 裁剪。
export type OrderHistoryEntry = {
  timePlaced?: string;
  orderId?: number;
  symbol?: string;
  quantity?: number;
  limitPrice?: number;
  // 已见终态 "CANCELED"；其余（FILLED 等）未观察
  status?: string;
  [key: string]: unknown;
};

export type RawPayloadResponseOrderHistory = {
  orderHistoryEntries: OrderHistoryEntry[];
};

// 订单历史查询（单次 snapshot）。
export default class OrderHistoryMessageHandler implements WebSocketApiMessageHandler<OrderHistoryRequestParams> {
  buildRequest({
    account,
    startTime,
    endTime,
    orderEntryFields,
    legFields,
  }: OrderHistoryRequestParams): RawPayloadRequest {
    const params: Record<string, unknown> = {
      account,
      startTime,
      endTime,
      orderEntryFields,
    };
    if (legFields !== undefined) params.legFields = legFields;
    return newPayload({
      header: { service: "order_history", id: "order_history", ver: 0 },
      params,
    });
  }

  service: ApiService = "order_history";
}
