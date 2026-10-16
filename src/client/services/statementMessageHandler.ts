import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 账户摘要数值，随账户类型不同字段可能有增减，故均为可选。
export type StatementValues = {
  NET_LIQ?: number;
  OPTION_BP?: number;
  STOCK_BP?: number;
  INTRADAY_BP?: number;
  DT_LEFT?: number;
  CASH_AND_SWEEP?: number;
  YTD_COMISSIONS?: number;
  AVAILABLE_FUNDS?: number;
  MARGIN_BALANCE?: number;
  LONG_STOCK?: number;
  LONG_MARGIN?: number;
  SHORT_MARGIN?: number;
  MARGIN_EQUITY?: number;
  EQUITY_PERC?: number;
  MAINTENANCE_REQ?: number;
  MONEY_MARKET_BALANCE?: number;
  SHORT_BALANCE?: number;
  CASH_BALANCE?: number;
  FUT_COMMISSIONS_YTD?: number;
  FOREX_BP?: number;
  FOREX_CASH?: number;
  FOREX_UPL?: number;
  FOREX_FPL?: number;
  FOREX_EQUITY?: number;
  FOREX_MARGIN?: number;
  FOREX_RISK_LEVEL?: number;
  FOREX_YTD_COMMISSION?: number;
  FOREX_ACCOUNT?: string;
  EQUITY_COMMISSIONS_FEES_YTD?: number;
};

export type RawPayloadResponseStatement = {
  values: StatementValues;
};

// 账户单日账单摘要，params 为 { account }。
export default class StatementMessageHandler implements WebSocketApiMessageHandler<string> {
  buildRequest(account: string): RawPayloadRequest {
    return newPayload({
      header: { service: "statement", id: "account-statement", ver: 0 },
      params: { account },
    });
  }

  service: ApiService = "statement";
}
