import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 可用字段枚举：[ASK, ASK_EXCHANGE, ASK_SIZE, BID, BID_EXCHANGE, BID_SIZE,
// LAST, LAST_ETH, LAST_RTH, LAST_EXCHANGE, LAST_SIZE, VOLUME]
// ——一次性报价无流式 MARK 等字段。
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

// 默认字段集合不含 LAST_ETH。
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

// 响应：{items:[{symbol, isDelayed, values:{ASK:341.19, ...}}]}
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
