import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

const ALL_FIELDS = [
  "MARK",
  "MARK_CHANGE",
  "MARK_PERCENT_CHANGE",
  "NET_CHANGE",
  "NET_CHANGE_PERCENT",
  "BID",
  "ASK",
  "BID_SIZE",
  "ASK_SIZE",
  "VOLUME",
  "OPEN",
  "HIGH",
  "LOW",
  "LAST",
  "LAST_SIZE",
  "CLOSE",
] as const;

type FieldType = (typeof ALL_FIELDS)[number];

export type RawPayloadResponseQuotesItem = {
  symbol?: string;
  isDelayed?: boolean;
  values: {
    [key in FieldType]?: number;
  };
};

export type RawPayloadResponseQuotesSnapshot = {
  items: RawPayloadResponseQuotesItem[];
};

export default class QuotesMessageHandler implements WebSocketApiMessageHandler<
  string[]
> {
  buildRequest(symbols: string[]): RawPayloadRequest {
    return newPayload({
      header: { service: "quotes", id: "generalQuotes", ver: 0 },
      // P7：不再硬编码 account:"COMBINED ACCOUNT"——2026-10-13
      // 实测省略 account 参数服务器同样返回全账户行情
      // （scripts/exp-quotes-noaccount.mjs：items=1 MARK=340.53）。
      params: {
        symbols,
        refreshRate: 300,
        fields: ALL_FIELDS,
      },
    });
  }

  service: ApiService = "quotes";
}
