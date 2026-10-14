import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 响应字段实测自 本地录制（type: snapshot）
export type RawAccountsItem = {
  code: string;
  description?: string;
  tradeable: boolean;
  // 实测值: "MARGIN" | "IRA MGN"
  accountKind: string;
  // 实测值: "FUNDED"
  accountStatus: string;
  hasForexAccount: boolean;
  hasFuturesAccount: boolean;
  hasCryptoAccount: boolean;
  isPortfolioMargining: boolean;
  isIntradayMarginingEnabled: boolean;
  // 实测值: "TOS"
  orderManagementSystem: string;
  // 实测值: "TDAML"
  marginingMethod: string;
  // 实测值: "FULL" | "SPREADS"
  optionApprovalLevel: string;
};

export type RawPayloadResponseAccounts = {
  items: RawAccountsItem[];
};

// 账户列表。params 实测为空对象。
export default class AccountsMessageHandler implements WebSocketApiMessageHandler<void> {
  buildRequest(_: void): RawPayloadRequest {
    return newPayload({
      header: { service: "accounts", id: "accounts", ver: 0 },
      params: {},
    });
  }

  service: ApiService = "accounts";
}
