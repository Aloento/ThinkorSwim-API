import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

export type WatchlistSummaryItem = {
  id: number;
  name: string;
  // 取值示例: "STATIC" | "STOCK_SCAN" 等
  type: string;
};

export type WatchlistCategory = {
  // 取值: "ACCOUNT_POSITIONS" | "WORKING_ORDERS" | "TOP10" | "PUBLIC" | "PERSONAL" 等
  name: string;
  watchlists: WatchlistSummaryItem[];
};

// 无自定义 watchlist 时 body 为空对象，故 categories 可选。
export type RawPayloadResponseWatchlistCategories = {
  categories?: WatchlistCategory[];
};

export type WatchlistCategoriesRequestParams = {
  // 参数名 categories 必需；数组取值语义未进一步确认，原样透传。
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
