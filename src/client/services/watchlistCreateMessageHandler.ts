import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import { GetWatchListResponseItem } from "./getWatchlistMessageHandler.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 实测自本地录制：
// 请求可用参数集合为 [watchlistName, symbols]（params.name / params.watchlistId
// 均报 error——create 不支持 upsert）。
// create 之后增删/重排成分走
// watchlist/add、watchlist/remove、watchlist/rearrange，
// 见 watchlistAdd / watchlistRemove / watchlistRearrange MessageHandler。
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
