import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 可用参数仅 [symbol, limit]；传 params.symbols（复数）报 error。
export type NewsHeadersGetRequestParams = {
  symbol: string;
  limit?: number;
};

export type NewsHeaderItem = {
  newsCode: string;
  // ISO-8601 时间串，如 "2026-10-13T22:26:11Z"
  time: string;
  title: string;
  symbols: string[];
  // 取值示例: "BENZINGA" | "CNBC" | "REUTERS_VIDEO" | "DOW_JONES"
  channel: string;
};

export type RawPayloadResponseNewsHeaders = {
  news: NewsHeaderItem[];
};

// 新闻标题查询（单次 snapshot）。
// 推送版 news_headers/subscribe 存在但参数/推送形状未验证，见
// newsHeadersSubscribeMessageHandler。
export default class NewsHeadersGetMessageHandler implements WebSocketApiMessageHandler<NewsHeadersGetRequestParams> {
  buildRequest({
    symbol,
    limit,
  }: NewsHeadersGetRequestParams): RawPayloadRequest {
    const params: Record<string, unknown> = { symbol };
    if (limit !== undefined) params.limit = limit;
    return newPayload({
      header: { service: "news_headers/get", id: "news_headers/get", ver: 0 },
      params,
    });
  }

  service: ApiService = "news_headers/get";
}
