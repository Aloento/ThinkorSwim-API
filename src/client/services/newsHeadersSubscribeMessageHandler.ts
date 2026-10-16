import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import { NewsHeaderItem } from "./newsHeadersGetMessageHandler.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 参数 params:{symbol}；响应处理与 news_headers/get 共用（同一回调消费 news[]）。
export type NewsHeadersSubscribeRequestParams = {
  symbol: string;
  // 并发订阅多个 symbol 时需按 id 区分响应；缺省用静态 id（单订阅够用）。
  requestId?: string;
};

export type RawPayloadResponseNewsSubscribe = {
  news: NewsHeaderItem[];
};

// 新闻标题订阅（推送流）。线上帧未验证——前端实际用 news_headers/get 轮询
// 模拟（把 subscribe 换成 get），故参数/响应按前端调用点写。
export default class NewsHeadersSubscribeMessageHandler implements WebSocketApiMessageHandler<NewsHeadersSubscribeRequestParams> {
  buildRequest({
    symbol,
    requestId,
  }: NewsHeadersSubscribeRequestParams): RawPayloadRequest {
    return newPayload({
      header: {
        service: "news_headers/subscribe",
        id: requestId ?? "news_headers_subscribe",
        ver: 0,
      },
      params: { symbol },
    });
  }

  service: ApiService = "news_headers/subscribe";
}
