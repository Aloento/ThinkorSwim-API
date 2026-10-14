import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import { NewsHeaderItem } from "./newsHeadersGetMessageHandler.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// bundle 调用点（本地录制（scripts/probe-services.mjs 可复现），逐字核对）：
//   news_headers/subscribe_relevant  params:{symbols}   （无 sortMode）
//   news_body                        params:{newsCode}
//                                    响应 {newsCode, text}
// 均为 bundle 证据，线上帧未实测；get_relevant 对 guest 已报
// "not permissioned"（news_headers_get_relevant.jsonl），subscribe_relevant
// 预计同样 guest 权限受限。

export type NewsHeadersSubscribeRelevantRequestParams = {
  symbols: string[];
  // 并发订阅区分响应（同 news_headers/subscribe）
  requestId?: string;
};

export type RawPayloadResponseNewsSubscribeRelevant = {
  news: NewsHeaderItem[];
};

export type NewsBodyRequestParams = {
  newsCode: string;
};

export type RawPayloadResponseNewsBody = {
  newsCode: string;
  text: string;
};

// 相关度新闻订阅（guest 权限受限，params 按 bundle 写全）。
export default class NewsHeadersSubscribeRelevantMessageHandler implements WebSocketApiMessageHandler<NewsHeadersSubscribeRelevantRequestParams> {
  buildRequest({
    symbols,
    requestId,
  }: NewsHeadersSubscribeRelevantRequestParams): RawPayloadRequest {
    return newPayload({
      header: {
        service: "news_headers/subscribe_relevant",
        id: requestId ?? "news_headers_subscribe_relevant",
        ver: 0,
      },
      params: { symbols },
    });
  }

  service: ApiService = "news_headers/subscribe_relevant";
}

export class NewsBodyMessageHandler implements WebSocketApiMessageHandler<NewsBodyRequestParams> {
  buildRequest({ newsCode }: NewsBodyRequestParams): RawPayloadRequest {
    return newPayload({
      header: { service: "news_body", id: "news_body", ver: 0 },
      params: { newsCode },
    });
  }

  service: ApiService = "news_body";
}
