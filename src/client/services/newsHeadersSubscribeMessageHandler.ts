import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import { NewsHeaderItem } from "./newsHeadersGetMessageHandler.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 参数实测自前端 bundle（本地录制）调用点：
//   {header:{service:"news_headers/subscribe",id:r,ver:0},params:{symbol:t}}
// 响应处理与 news_headers/get 共用（bundle 中同一回调消费 news[]）。
export type NewsHeadersSubscribeRequestParams = {
  symbol: string;
  // 并发订阅多个 symbol 时需区分响应（的 id 路由按 service+id 关联）。
  // bundle 调用点里 id 即动态 requestId；缺省用静态 id（单订阅场景够用）。
  requestId?: string;
};

export type RawPayloadResponseNewsSubscribe = {
  news: NewsHeaderItem[];
};

// 新闻标题订阅（推送流）。bundle 确认存在（TECHNICAL.md）；wsjson 线上
// 帧未实测——bundle 里前端其实是用 news_headers/get 轮询模拟的
// （requestId 把 subscribe 替换成 get），故本 handler 的参数/响应按 bundle
// 调用点写，标注未实测。
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
