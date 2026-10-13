import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 实测自 agent/artifacts/write-2026-10-13/W5e.jsonl 第 5 帧：删除成功时 body 为空对象。
export type RawPayloadResponseWatchlistDelete = Record<string, unknown>;

// 删除 watchlist。
// 注意：成分修改服务（watchlist/add_symbols、update_symbols、save、update、
// symbols、edit、modify、set_symbols 等变体）实测均为 "Undefined service"
// （W5b/W5c/W5e.jsonl），不存在，不要期望有对应 handler。
export default class WatchlistDeleteMessageHandler implements WebSocketApiMessageHandler<number> {
  buildRequest(watchlistId: number): RawPayloadRequest {
    return newPayload({
      header: { service: "watchlist/delete", id: "watchlist/delete", ver: 0 },
      params: { watchlistId },
    });
  }

  service: ApiService = "watchlist/delete";
}
