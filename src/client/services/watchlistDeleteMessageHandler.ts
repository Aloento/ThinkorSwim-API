import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 实测自本地录制第 5 帧：删除成功时 body 为空对象。
export type RawPayloadResponseWatchlistDelete = Record<string, unknown>;

// 删除 watchlist。
// 注：成分修改服务是 watchlist/add、watchlist/remove、watchlist/rearrange
// （params {watchlistId, symbols}，
// handler 见 watchlistAdd / watchlistRemove / watchlistRearrange
// MessageHandler）。
export default class WatchlistDeleteMessageHandler implements WebSocketApiMessageHandler<number> {
  buildRequest(watchlistId: number): RawPayloadRequest {
    return newPayload({
      header: { service: "watchlist/delete", id: "watchlist/delete", ver: 0 },
      params: { watchlistId },
    });
  }

  service: ApiService = "watchlist/delete";
}
