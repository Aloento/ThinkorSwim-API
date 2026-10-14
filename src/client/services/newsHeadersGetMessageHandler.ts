import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 实测自本地录制：
// 可用参数集合为 [symbol, limit]（"params.symbols" 报 error，见第 1 帧）。
export type NewsHeadersGetRequestParams = {
  symbol: string;
  limit?: number;
};

// news[] 字段实测自同文件第 2 帧（type: snapshot）。
export type NewsHeaderItem = {
  newsCode: string;
  // ISO-8601 时间串，如 "2026-10-13T22:26:11Z"
  time: string;
  title: string;
  symbols: string[];
  // 实测值: "BENZINGA" | "CNBC" | "REUTERS_VIDEO" | "DOW_JONES"
  channel: string;
};

export type RawPayloadResponseNewsHeaders = {
  news: NewsHeaderItem[];
};

// 新闻标题查询（单次 snapshot）。
// 注：推送版 news_headers/subscribe 在 bundle 中确认存在，但参数/推送形状
// 未实测（bundle 挖掘发现），暂不提供 handler。
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
