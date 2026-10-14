import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 实测自 paper 会话录制（watchlist/categories 与写用例 W5 系列帧）。
export type WatchlistSummaryItem = {
  id: number;
  name: string;
  // 实测值: "STATIC" | "STOCK_SCAN" 等
  type: string;
};

export type WatchlistCategory = {
  // 实测值: "ACCOUNT_POSITIONS" | "WORKING_ORDERS" | "TOP10" | "PUBLIC" | "PERSONAL" 等
  name: string;
  watchlists: WatchlistSummaryItem[];
};

// 无自定义 watchlist 时 body 实测为空对象（W5.jsonl 第 2 帧），故 categories 可选。
export type RawPayloadResponseWatchlistCategories = {
  categories?: WatchlistCategory[];
};

export type WatchlistCategoriesRequestParams = {
  // 参数名 categories 为实测确认；数组取值的完整语义未进一步黑盒确认，原样透传。
  categories: string[];
};

export default class WatchlistCategoriesMessageHandler implements WebSocketApiMessageHandler<WatchlistCategoriesRequestParams> {
  buildRequest({
    categories,
  }: WatchlistCategoriesRequestParams): RawPayloadRequest {
    return newPayload({
      header: {
        service: "watchlist/categories",
        id: "watchlist/categories",
        ver: 0,
      },
      params: { categories },
    });
  }

  service: ApiService = "watchlist/categories";
}
