import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import { GetWatchListResponseItem } from "./getWatchlistMessageHandler.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 可用参数仅 [watchlistName, symbols]；params.name / params.watchlistId 报
// error——create 不支持 upsert。
// 成分修改走 watchlist/add、watchlist/remove、watchlist/rearrange。
export type WatchlistCreateRequestParams = {
  watchlistName: string;
  symbols: string[];
};

export type RawPayloadResponseWatchlistCreate = {
  watchlist: GetWatchListResponseItem;
};

// 创建 watchlist。
export default class WatchlistCreateMessageHandler implements WebSocketApiMessageHandler<WatchlistCreateRequestParams> {
  buildRequest({
    watchlistName,
    symbols,
  }: WatchlistCreateRequestParams): RawPayloadRequest {
    return newPayload({
      header: { service: "watchlist/create", id: "watchlist/create", ver: 0 },
      params: { watchlistName, symbols },
    });
  }

  service: ApiService = "watchlist/create";
}
