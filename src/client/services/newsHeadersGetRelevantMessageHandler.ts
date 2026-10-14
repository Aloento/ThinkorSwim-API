import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 枚举抄自本地录制
// 错误帧："Possible enum values are [BY_RELEVANCE, BY_TIME]"。
const SORT_MODES = ["BY_RELEVANCE", "BY_TIME"] as const;

export type NewsRelevantSortMode = (typeof SORT_MODES)[number];

// 可用参数集合抄自同文件错误帧：
// "Mismatched request parameter name is \"params.symbol\". Available
// parameters are [sortMode, symbols, account, limit]"——注意是 symbols
// （复数数组），与 news_headers/get 的 symbol（单数字符串）不同。
export type NewsHeadersGetRelevantRequestParams = {
  sortMode: NewsRelevantSortMode;
  symbols: string[];
  limit?: number;
  account?: string;
};

// 相关度新闻查询（guest 权限受限：参数全部正确时报
// "You are not permissioned for personalized news."（isTerminal），见同文件
// probe-news-rel4 帧——params 按校验帧写全，成功帧待真实账户）。
// 响应复用 news_headers/get 实测形状 {news: NewsHeaderItem[]}。
export default class NewsHeadersGetRelevantMessageHandler implements WebSocketApiMessageHandler<NewsHeadersGetRelevantRequestParams> {
  buildRequest({
    sortMode,
    symbols,
    limit,
    account,
  }: NewsHeadersGetRelevantRequestParams): RawPayloadRequest {
    const params: Record<string, unknown> = { sortMode, symbols };
    if (limit !== undefined) params.limit = limit;
    if (account !== undefined) params.account = account;
    return newPayload({
      header: {
        service: "news_headers/get_relevant",
        id: "news_headers/get_relevant",
        ver: 0,
      },
      params,
    });
  }

  service: ApiService = "news_headers/get_relevant";
}
