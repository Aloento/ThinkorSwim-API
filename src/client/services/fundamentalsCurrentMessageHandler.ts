import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 枚举值全量抄自本地录制
// 第 2 帧服务端错误帧："Possible enum values are [...]"。
// 发送集合外的值会导致整条请求报 error。
const FUNDAMENTALS_FIELDS = [
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
  "PRICE_TO_EARNINGS_RATIO",
  "PRICE_TO_CASH_FLOW_RATIO",
  "PRICE_TO_BOOK_VALUE_RATIO",
  "MARKET_CAP_TO_COMMON_EQUITY_RATIO",
  "DIVIDEND_YIELD",
  "DIVIDEND_PAYOUT_PER_SHARE",
  "REVENUE",
  "NET_INCOME",
  "EARNINGS_PER_SHARE",
  "DIVIDENDS_PER_SHARE",
  "BOOK_VALUE_PER_SHARE_GROWTH",
  "EBITDA",
  "COMPANY_NAME",
  "COMPANY_ADDRESS_STREET",
  "COMPANY_ADDRESS_CITY",
  "COMPANY_ADDRESS_STATE",
  "COMPANY_ADDRESS_ZIP",
  "COMPANY_ADDRESS_NATION",
  "COMPANY_WEBSITE",
  "COMPANY_PHONE",
  "COMPANY_BUSINESS_DESCRIPTION",
  "LAST_ANNUAL_FILING_DATE",
  "LAST_INTERIM_FILING_DATE",
  "DATE_OF_INCORPORATION",
] as const;

export type FundamentalsField = (typeof FUNDAMENTALS_FIELDS)[number];

// 线上实测：非法值错误帧
// 自曝枚举 "Possible enum values are [QUARTERLY, ANNUAL]"。
export type FundamentalsTime = "QUARTERLY" | "ANNUAL";

// 服务端校验（第 1 帧错误帧）："$.params.fields: must not be empty;
// $.params.time: must not be null"——两者必传。
export type FundamentalsCurrentRequestParams = {
  symbol: string;
  // 实测枚举 [QUARTERLY, ANNUAL]，ANNUAL 实测 snapshot 成功。
  time: FundamentalsTime;
  fields: FundamentalsField[];
};

// values 形状实测自第 3 帧 snapshot（指标名 → 数值；COMPANY_* 类字段为字符串）。
export type RawPayloadResponseFundamentals = {
  symbol: string;
  values: Partial<Record<FundamentalsField, string | number | null>>;
};

// 当前基本面指标查询（单次 snapshot）。
export default class FundamentalsCurrentMessageHandler implements WebSocketApiMessageHandler<FundamentalsCurrentRequestParams> {
  buildRequest({
    symbol,
    time,
    fields,
  }: FundamentalsCurrentRequestParams): RawPayloadRequest {
    return newPayload({
      header: {
        service: "fundamentals/current",
        id: "fundamentals/current",
        ver: 0,
      },
      params: { symbol, time, fields },
    });
  }

  service: ApiService = "fundamentals/current";
}
