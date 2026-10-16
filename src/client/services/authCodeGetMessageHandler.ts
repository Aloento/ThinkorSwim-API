import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 必填校验："$.params.issuedTo: must not be blank; $.params.refreshToken: must
// not be blank; $.params.appliesTo: must not be blank"。
// refreshToken 换一次性 auth code（bundle 枚举名 EXCHANGE_RT_FOR_AUTH_CODE），
// code 可再走 authenticateWithAuthCode / REST 换全套 token。

export type AuthCodeGetRequestParams = {
  // 授权目标：issuedTo/appliesTo 为账户或主体标识，具体取值未验证
  issuedTo: string;
  refreshToken: string;
  appliesTo: string;
};

// 响应：{code}
export type RawPayloadResponseAuthCodeGet = {
  code: string;
};

// refreshToken → 一次性 auth code（wsjson 通道）。
export default class AuthCodeGetMessageHandler implements WebSocketApiMessageHandler<AuthCodeGetRequestParams> {
  buildRequest({
    issuedTo,
    refreshToken,
    appliesTo,
  }: AuthCodeGetRequestParams): RawPayloadRequest {
    return newPayload({
      header: { service: "auth_code/get", id: "auth_code/get", ver: 0 },
      params: { issuedTo, refreshToken, appliesTo },
    });
  }

  service: ApiService = "auth_code/get";
}
