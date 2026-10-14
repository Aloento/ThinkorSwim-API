import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import { GetWatchListResponseItem } from "./getWatchlistMessageHandler.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 实测自 本地录制 第 1/2 帧：
// 可用参数集合为 [watchlistId, symbols]（"params.symbol" 单数报 error）。
export type WatchlistModifyRequestParams = {
  watchlistId: number;
  symbols: string[];
};

// 成功响应为**合并后**的完整 watchlist（W5f 第 1 帧：
// {"watchlist":{"id":1222638110,"name":"ProbeWL","symbols":["AAPL","SPY","TSLA"]}}）。
export type RawPayloadResponseWatchlistAdd = {
  watchlist: GetWatchListResponseItem;
};

// 向 watchlist 添加成分（服务端忽略已存在的符号，响应返回合并后列表）。
export default class WatchlistAddMessageHandler implements WebSocketApiMessageHandler<WatchlistModifyRequestParams> {
  buildRequest({
    watchlistId,
    symbols,
  }: WatchlistModifyRequestParams): RawPayloadRequest {
    return newPayload({
      header: { service: "watchlist/add", id: "watchlist/add", ver: 0 },
      params: { watchlistId, symbols },
    });
  }

  service: ApiService = "watchlist/add";
}
