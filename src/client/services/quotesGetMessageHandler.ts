import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 枚举抄自 agent/artifacts/probe-2026-10-13/quotes_get.jsonl 错误帧：
// "Possible enum values are [ASK, ASK_EXCHANGE, ASK_SIZE, BID,
// BID_EXCHANGE, BID_SIZE, LAST, LAST_ETH, LAST_RTH, LAST_EXCHANGE,
// LAST_SIZE, VOLUME]"——一次性报价可用字段（无流式 MARK 等，06 第三轮）。
const QUOTES_GET_FIELDS = [
  "ASK",
  "ASK_EXCHANGE",
  "ASK_SIZE",
  "BID",
  "BID_EXCHANGE",
  "BID_SIZE",
  "LAST",
  "LAST_ETH",
  "LAST_RTH",
  "LAST_EXCHANGE",
  "LAST_SIZE",
  "VOLUME",
] as const;

export type QuotesGetField = (typeof QUOTES_GET_FIELDS)[number];

// bundle 默认字段集合（frontend-index.js，逐字核对）不含 LAST_ETH。
export const DEFAULT_QUOTES_GET_FIELDS: QuotesGetField[] = [
  "BID",
  "BID_SIZE",
  "BID_EXCHANGE",
  "ASK",
  "ASK_SIZE",
  "ASK_EXCHANGE",
  "LAST",
  "LAST_RTH",
  "LAST_SIZE",
  "LAST_EXCHANGE",
  "VOLUME",
];

export type QuotesGetRequestParams = {
  symbols: string[];
  fields?: QuotesGetField[];
};

// 响应形状实测自同文件第 3 帧（type: snapshot）：
// {items:[{symbol, isDelayed, values:{ASK:341.19, ...}}]}
export type QuotesGetItem = {
  symbol: string;
  isDelayed: boolean;
  values: Partial<Record<QuotesGetField, number>>;
};

export type RawPayloadResponseQuotesGet = {
  items: QuotesGetItem[];
};

// 一次性报价快照（区别于 quotes 订阅流；不建立持续订阅）。
export default class QuotesGetMessageHandler implements WebSocketApiMessageHandler<QuotesGetRequestParams> {
  buildRequest({
    symbols,
    fields = DEFAULT_QUOTES_GET_FIELDS,
  }: QuotesGetRequestParams): RawPayloadRequest {
    return newPayload({
      header: { service: "quotes/get", id: "quotes/get", ver: 0 },
      params: { symbols, fields },
    });
  }

  service: ApiService = "quotes/get";
}
