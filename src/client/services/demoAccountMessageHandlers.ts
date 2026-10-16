import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 模拟盘（demo account）资金操作。
// 必填校验：set_balance 要求 accountCode 非 null；adjust_cash 要求
// accountCode、cashAmount 非 null。
// 参数与 id：
//   set_balance  id:"set_balance"  params:{accountCode, newBalance, resetAccount:true}
//   adjust_cash  id:"adjust_cash"  params:{accountCode, cashAmount,
//                description:`Transfer ${cashAmount} dollars`}
// 响应只关心 type!=="error"（无业务字段）；guest 是 PaperMoney 会话，
// demo_account 服务的适用性待真实模拟盘账户确认。

export type DemoAccountSetBalanceRequestParams = {
  accountCode: string;
  newBalance: number;
  // 前端固定 true；是否重置账户其余状态未确认
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
