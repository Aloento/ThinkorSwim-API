import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 实测自 agent/artifacts/write-2026-10-13/W5b.jsonl 第 2 帧。
export type WatchlistRenameRequestParams = {
  watchlistId: number;
  watchlistName: string;
};

export type RawPayloadResponseWatchlistRename = {
  watchlistId: number;
  watchlistName: string;
};

// 重命名 watchlist。
export default class WatchlistRenameMessageHandler implements WebSocketApiMessageHandler<WatchlistRenameRequestParams> {
  buildRequest({
    watchlistId,
    watchlistName,
  }: WatchlistRenameRequestParams): RawPayloadRequest {
    return newPayload({
      header: { service: "watchlist/rename", id: "watchlist/rename", ver: 0 },
      params: { watchlistId, watchlistName },
    });
  }

  service: ApiService = "watchlist/rename";
}
