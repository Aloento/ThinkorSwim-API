import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 模拟盘（demo account）资金操作。参数双证据：
// 1) 校验帧（demo_account_set_balance.jsonl / demo_account_adjust_cash.jsonl）：
//    set_balance   "$.params.accountCode: must not be null"
//    adjust_cash   "$.params.accountCode: must not be null;
//                   $.params.cashAmount: must not be null"
// 2) bundle 调用点（本地录制，逐字核对）：
//    set_balance  id:"set_balance"  params:{accountCode, newBalance, resetAccount:true}
//    adjust_cash  id:"adjust_cash"  params:{accountCode, cashAmount, description:`Transfer ${cashAmount} dollars`}
// 响应按 bundle 判定逻辑只关心 type!=="error"（无业务字段），成功帧 guest
// 未实测——guest 是 PaperMoney 会话，demo_account 服务的适用性待真实
// 模拟盘账户确认。

export type DemoAccountSetBalanceRequestParams = {
  accountCode: string;
  newBalance: number;
  // bundle 固定 true；保留可关（是否重置账户其余状态未实测）
  resetAccount?: boolean;
};

export type DemoAccountAdjustCashRequestParams = {
  accountCode: string;
  cashAmount: number;
  description?: string;
};

export default class DemoAccountSetBalanceMessageHandler implements WebSocketApiMessageHandler<DemoAccountSetBalanceRequestParams> {
  buildRequest({
    accountCode,
    newBalance,
    resetAccount = true,
  }: DemoAccountSetBalanceRequestParams): RawPayloadRequest {
    return newPayload({
      header: {
        service: "demo_account/set_balance",
        id: "set_balance",
        ver: 0,
      },
      params: { accountCode, newBalance, resetAccount },
    });
  }

  service: ApiService = "demo_account/set_balance";
}

export class DemoAccountAdjustCashMessageHandler implements WebSocketApiMessageHandler<DemoAccountAdjustCashRequestParams> {
  buildRequest({
    accountCode,
    cashAmount,
    description = `Transfer ${cashAmount} dollars`,
  }: DemoAccountAdjustCashRequestParams): RawPayloadRequest {
    return newPayload({
      header: {
        service: "demo_account/adjust_cash",
        id: "adjust_cash",
        ver: 0,
      },
      params: { accountCode, cashAmount, description },
    });
  }

  service: ApiService = "demo_account/adjust_cash";
}
