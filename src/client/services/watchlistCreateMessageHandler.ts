import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import { GetWatchListResponseItem } from "./getWatchlistMessageHandler.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 实测自 agent/artifacts/write-2026-10-13/W5.jsonl：
// 请求可用参数集合为 [watchlistName, symbols]（params.name / params.watchlistId
// 均报 error，见 W5.jsonl 第 1 帧、W5d.jsonl 第 1 帧——即 create 不支持 upsert）。
// 更正（第三轮实测 W5f.jsonl）：create 之后增删/重排成分走
// watchlist/add、watchlist/remove、watchlist/rearrange（此前误判为"不存在"），
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
