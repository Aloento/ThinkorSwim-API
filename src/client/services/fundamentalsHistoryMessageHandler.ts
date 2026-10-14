import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// fundamentals/history 实测（本地录制（scripts/probe-services.mjs 可复现），
// exp-fund-hist3.mjs guest paper 逐字段扫描，2026-10-14）：
// 参数仅 {symbol, fields}——**没有 time**：bundle 调用点里的 time 是前端网关
// 层剥掉的，线协议直接拒（`Mismatched request parameter name is "params.time"`，
// 见 probe-2026-10-13/fundamentals_history.jsonl 三帧 + 本轮复测）。
// fields 必填非空，且只收 21 个 historical 字段（current 45 枚举的真子集，
// 集合外报 "Non historical field requested: X"）。
export const FUNDAMENTALS_HISTORY_FIELDS = [
  "EARNINGS_PER_SHARE_TTM",
  "DIVIDENDS_PER_SHARE_TTM",
  "BOOK_VALUE_PER_SHARE",
  "CASH_FLOW_PER_SHARE_CURRENT",
  "FREE_CASH_FLOW_PER_SHARE",
  "SALES_PER_SHARE",
  "RETURN_ON_EQUITY",
  "RETURN_ON_ASSETS",
  "GROSS_PROFIT_MARGIN",
  "OPERATING_PROFIT_MARGIN",
  "TAX_RATE",
  "INTEREST_RATE",
  "NET_PROFIT_MARGIN",
  "TOTAL_ASSET_TURNOVER",
  "INVENTORY_TURNOVER",
  "LONG_TERM_DEBT_TO_CAPITAL",
  "FINANCIAL_LEVERAGE",
  "FIXED_CHARGE_COVERAGE_RATIO",
  "DIVIDEND_PAYOUT",
  "QUICK_RATIO",
  "CURRENT_RATIO",
] as const;

export type FundamentalsHistoryField =
  (typeof FUNDAMENTALS_HISTORY_FIELDS)[number];

export type FundamentalsHistoryRequestParams = {
  symbol: string;
  fields: FundamentalsHistoryField[];
};

// 实测 snapshot（fund-hist-findings.md）：键为 "year=2025, interval=Q2" /
// "year=2021, interval=ANNUAL" 形式的序列；季度序列字段 annualValues 可为空
// 对象，INTEREST_RATE/FIXED_CHARGE_COVERAGE_RATIO 仅 annualValues。
export type FundamentalsHistorySeries = Partial<
  Record<FundamentalsHistoryField, Record<string, number | string | null>>
>;

export type RawPayloadResponseFundamentalsHistory = {
  symbol: string;
  quarterlyValues?: FundamentalsHistorySeries;
  annualValues?: FundamentalsHistorySeries;
};

// 历史基本面数据（按年度/季度序列）。guest paper 实测 snapshot 通过。
export default class FundamentalsHistoryMessageHandler implements WebSocketApiMessageHandler<FundamentalsHistoryRequestParams> {
  buildRequest({
    symbol,
    fields,
  }: FundamentalsHistoryRequestParams): RawPayloadRequest {
    return newPayload({
      header: {
        service: "fundamentals/history",
        id: "fundamentals/history",
        ver: 0,
      },
      params: { symbol, fields },
    });
  }

  service: ApiService = "fundamentals/history";
}
