import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 实测自 agent/artifacts/write-2026-10-13/W5e.jsonl 第 5 帧：删除成功时 body 为空对象。
export type RawPayloadResponseWatchlistDelete = Record<string, unknown>;

// 删除 watchlist。
// 注：成分修改服务是 watchlist/add、watchlist/remove、watchlist/rearrange
// （agent/06 第 4 节 bundle 挖掘第二轮实测确认，params {watchlistId, symbols}，
// 实测帧 write-2026-10-13/W5f.jsonl；handler 见 watchlistAdd / watchlistRemove /
// watchlistRearrange MessageHandler）；早期 7 个猜测名（add_symbols 等，
// 见 W5b/W5c/W5e.jsonl）均为 "Undefined service"。
export default class WatchlistDeleteMessageHandler implements WebSocketApiMessageHandler<number> {
  buildRequest(watchlistId: number): RawPayloadRequest {
    return newPayload({
      header: { service: "watchlist/delete", id: "watchlist/delete", ver: 0 },
      params: { watchlistId },
    });
  }

  service: ApiService = "watchlist/delete";
}
