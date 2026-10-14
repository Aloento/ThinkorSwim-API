import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";
import type { WatchlistModifyRequestParams } from "./watchlistAddMessageHandler.js";

// 实测自 本地录制 第 4 帧：
// 成功响应 body 为空对象；顺序生效需再 watchlist/get 验证。
export type RawPayloadResponseWatchlistRearrange = Record<string, unknown>;

// 重排 watchlist 成分：symbols 传**新顺序**的完整列表。
export default class WatchlistRearrangeMessageHandler implements WebSocketApiMessageHandler<WatchlistModifyRequestParams> {
  buildRequest({
    watchlistId,
    symbols,
  }: WatchlistModifyRequestParams): RawPayloadRequest {
    return newPayload({
      header: {
        service: "watchlist/rearrange",
        id: "watchlist/rearrange",
        ver: 0,
      },
      params: { watchlistId, symbols },
    });
  }

  service: ApiService = "watchlist/rearrange";
}
