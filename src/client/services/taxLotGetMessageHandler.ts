import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 枚举值全量抄自 本地录制
// 第 2 帧服务端错误帧："Possible enum values are [...]"。
const TAX_LOT_FIELDS = [
  "SYMBOL",
  "OPEN_DATE",
  "COST_PER_SHARE",
  "TOTAL_COST",
  "QUANTITY",
  "HOLDING_PERIOD",
  "WASH_SALE",
  "ORG_PURCHASE_DATE",
  "ACQUIRED_DATE",
  "CUSIP",
  "SSID",
  "BROKER_ACCOUNT_ID",
  "DISALLOWED_LOSS",
  "ACQUIRED_DATE_EPOCH",
] as const;

export type TaxLotField = (typeof TAX_LOT_FIELDS)[number];

// 服务端校验（tax_lot_get.jsonl 第 1/3 帧错误帧）：
//  - taxLotFields 不得为空；
//  - refreshToken 不得为空串（blank）；
//  - guest 会话报 "Account lots lookup is not allowed for the current
//    user"（第 4/5 帧）——真实账户待测。
export type TaxLotGetRequestParams = {
  // 真实账户 code（如 "D-XXXXXXXX"，参照 order_history；probe 用
  // "COMBINED ACCOUNT" 报的是权限错误，无法区分格式校验，保守用真实 code）
  account: string;
  symbol: string;
  taxLotFields: TaxLotField[];
  // 非空串；语义未实测（推测为变更通知 token，空仓时无内容可回）
  refreshToken: string;
};

// 响应成功形状未实测（guest 无权限）。按字段枚举给出宽类型。
export type TaxLotItem = Partial<Record<TaxLotField, unknown>> &
  Record<string, unknown>;

export type RawPayloadResponseTaxLotGet = {
  lots?: TaxLotItem[];
  refreshToken?: string;
  [key: string]: unknown;
};

// 税则批次（tax lot）查询。guest 账号被服务端拒绝，真实账户待测。
export default class TaxLotGetMessageHandler implements WebSocketApiMessageHandler<TaxLotGetRequestParams> {
  buildRequest({
    account,
    symbol,
    taxLotFields,
    refreshToken,
  }: TaxLotGetRequestParams): RawPayloadRequest {
    return newPayload({
      header: { service: "tax_lot/get", id: "tax_lot/get", ver: 0 },
      params: { account, symbol, taxLotFields, refreshToken },
    });
  }

  service: ApiService = "tax_lot/get";
}
