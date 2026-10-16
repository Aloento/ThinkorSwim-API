import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

export type RawAccountsItem = {
  code: string;
  description?: string;
  tradeable: boolean;
  // 取值示例: "MARGIN" | "IRA MGN"
  accountKind: string;
  // 取值示例: "FUNDED"
  accountStatus: string;
  hasForexAccount: boolean;
  hasFuturesAccount: boolean;
  hasCryptoAccount: boolean;
  isPortfolioMargining: boolean;
  isIntradayMarginingEnabled: boolean;
  // 取值示例: "TOS"
  orderManagementSystem: string;
  // 取值示例: "TDAML"
  marginingMethod: string;
  // 取值示例: "FULL" | "SPREADS"
  optionApprovalLevel: string;
};

export type RawPayloadResponseAccounts = {
  items: RawAccountsItem[];
};

// 账户列表。params 为空对象。
export default class AccountsMessageHandler implements WebSocketApiMessageHandler<void> {
  buildRequest(_: void): RawPayloadRequest {
    return newPayload({
      header: { service: "accounts", id: "accounts", ver: 0 },
      params: {},
    });
  }

  service: ApiService = "accounts";
}
