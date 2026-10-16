import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import { GetWatchListResponseItem } from "./getWatchlistMessageHandler.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";
import type { WatchlistModifyRequestParams } from "./watchlistAddMessageHandler.js";

// 请求参数与 watchlist/add 相同 [watchlistId, symbols]；
// 响应返回删除后**合并**的 watchlist。
export type RawPayloadResponseWatchlistRemove = {
  watchlist: GetWatchListResponseItem;
};

// 从 watchlist 删除成分。
export default class WatchlistRemoveMessageHandler implements WebSocketApiMessageHandler<WatchlistModifyRequestParams> {
  buildRequest({
    watchlistId,
    symbols,
  }: WatchlistModifyRequestParams): RawPayloadRequest {
    return newPayload({
      header: { service: "watchlist/remove", id: "watchlist/remove", ver: 0 },
      params: { watchlistId, symbols },
    });
  }

  service: ApiService = "watchlist/remove";
}
