import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 删除成功时 body 为空对象。
export type RawPayloadResponseWatchlistDelete = Record<string, unknown>;

// 删除 watchlist。
// 成分修改服务是 watchlist/add、watchlist/remove、watchlist/rearrange。
export default class WatchlistDeleteMessageHandler implements WebSocketApiMessageHandler<number> {
  buildRequest(watchlistId: number): RawPayloadRequest {
    return newPayload({
      header: { service: "watchlist/delete", id: "watchlist/delete", ver: 0 },
      params: { watchlistId },
    });
  }

  service: ApiService = "watchlist/delete";
}
