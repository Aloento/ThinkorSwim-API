import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 请求参数实测自本地录制：
// 发送 params.exchanges 时服务端报错，可用参数集合为 [date, markets]。
export type MarketHoursRequestParams = {
  markets: string[];
  date: string;
};

export type MarketSessionHours = {
  start: string;
  end: string;
};

export type MarketHoursProductEntry = {
  date: string;
  // 实测值: "EQUITY" | "OPTION" | "FUTURE"
  marketType: string;
  product: string;
  productName: string;
  isOpen: boolean;
  // 仅 FUTURE 实测携带，如 "XCME" | "XCEC"
  exchange?: string;
  // 仅 FUTURE 实测携带，如 "Futures"
  category?: string;
  // 实测 key: "preMarket" | "regularMarket" | "postMarket" | "noTrading"
  sessionHours: Record<string, MarketSessionHours[]>;
};

// 实测结构: body.schwabMarketHours[marketType][product] = entry
// 例如 EQUITY.EQ / OPTION.EQO / FUTURE.ADA
export type RawPayloadResponseMarketHours = {
  schwabMarketHours: Record<string, Record<string, MarketHoursProductEntry>>;
};

export default class MarketHoursMessageHandler implements WebSocketApiMessageHandler<MarketHoursRequestParams> {
  buildRequest({ markets, date }: MarketHoursRequestParams): RawPayloadRequest {
    return newPayload({
      header: { service: "market_hours", id: "market-hours", ver: 0 },
      params: { markets, date },
    });
  }

  service: ApiService = "market_hours";
}
