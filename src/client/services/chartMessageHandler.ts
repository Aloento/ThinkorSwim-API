import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

export type ChartCandles = {
  closes: number[];
  highs: number[];
  lows: number[];
  opens: number[];
  timestamps: number[];
  volumes: number[];
};

export type RawPayloadResponseChart = {
  candles: ChartCandles;
  symbol: string;
};

// 服务端可用参数集合（实测自 agent/artifacts/probe-2026-10-13/chart.jsonl 错误帧）：
// [priceType, timeAggregation, extendedHours, studies, symbol,
//  startAtMarketOpen, range, cryptoMidnightUtc, tickAggregation, refreshRate]
// 发送未知参数名会导致整条请求报 error。
export type ChartRequestParams = {
  symbol: string;
  timeAggregation: string;
  range: string;
  // 对外兼容字段：buildRequest 输出时映射为服务端参数名 extendedHours。
  includeExtendedHours: boolean;
  priceType?: string;
  tickAggregation?: string;
  startAtMarketOpen?: boolean;
  cryptoMidnightUtc?: boolean;
  refreshRate?: number;
};

export default class ChartMessageHandler implements WebSocketApiMessageHandler<ChartRequestParams> {
  buildRequest({
    symbol,
    timeAggregation,
    range,
    includeExtendedHours,
    priceType,
    tickAggregation,
    startAtMarketOpen,
    cryptoMidnightUtc,
    refreshRate,
  }: ChartRequestParams): RawPayloadRequest {
    // params 只包含服务端可用参数集合内的键；未提供的可选键不发送，
    // 避免以 null/未知键形式污染请求。
    const params: Record<string, any> = {
      symbol,
      timeAggregation,
      studies: [],
      range,
      extendedHours: includeExtendedHours,
    };
    if (priceType !== undefined) params.priceType = priceType;
    if (tickAggregation !== undefined) params.tickAggregation = tickAggregation;
    if (startAtMarketOpen !== undefined)
      params.startAtMarketOpen = startAtMarketOpen;
    if (cryptoMidnightUtc !== undefined)
      params.cryptoMidnightUtc = cryptoMidnightUtc;
    if (refreshRate !== undefined) params.refreshRate = refreshRate;

    return newPayload({
      header: { service: "chart", id: "chart-page-chart-1", ver: 1 },
      params,
    });
  }

  service: ApiService = "chart";
}
