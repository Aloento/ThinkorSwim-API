import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 实测自 agent/artifacts/probe-2026-10-13/options_statistics.jsonl：
// 可用参数集合为 [symbol, refreshRate, deltaIntervals]（"underlyingSymbol"
// 报 error，见第 1 帧）。
export type OptionsStatisticsRequestParams = {
  symbol: string;
  // 推送刷新周期；未实测确认单位，chart/quotes 同名参数使用毫秒。
  refreshRate?: number;
  // 自定义 delta 分桶；响应 delta 键形如 "21...40"。未实测确认形状。
  deltaIntervals?: unknown;
};

// 分桶统计：values 为成交量计数，percents 为百分比（可为 0）。
export type OptionsStatisticsBucket = {
  values: { calls: number; puts: number; total: number };
  percents?: {
    callsPercent: number;
    putsPercent: number;
    totalPercent: number;
  };
};

// 响应形状实测自第 2 帧 snapshot。响应为 snapshot + 持续 patch 流
// （同 quotes），门面侧将来以 AsyncIterable 消费。
export type RawPayloadResponseOptionsStatistics = {
  symbol: string;
  pcRatio: number;
  totalVolume: OptionsStatisticsBucket;
  bidOrBelow: OptionsStatisticsBucket;
  askOrAbove: OptionsStatisticsBucket;
  betweenTheMarket: OptionsStatisticsBucket;
  // 键为 delta 区间（"0...20" | "21...40" | "41...60" | "61...80" | "81...100"）
  delta: Record<string, OptionsStatisticsBucket>;
};

// 期权链统计（P/C 比、按 delta 分桶的成交量等）。snapshot+patch 推送流。
export default class OptionsStatisticsMessageHandler implements WebSocketApiMessageHandler<OptionsStatisticsRequestParams> {
  buildRequest({
    symbol,
    refreshRate,
    deltaIntervals,
  }: OptionsStatisticsRequestParams): RawPayloadRequest {
    const params: Record<string, unknown> = { symbol };
    if (refreshRate !== undefined) params.refreshRate = refreshRate;
    if (deltaIntervals !== undefined) params.deltaIntervals = deltaIntervals;
    return newPayload({
      header: {
        service: "options_statistics",
        id: "options_statistics",
        ver: 0,
      },
      params,
    });
  }

  service: ApiService = "options_statistics";
}
