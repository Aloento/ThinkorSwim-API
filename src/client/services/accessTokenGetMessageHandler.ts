import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 必填校验抄自本地录制：
// "$.params.refreshToken: must not be null; $.params.scope: must not be
// null; $.params.clientId: must not be null"。guest 无 refreshToken，成功
// 帧未实测。
//
// token 续期服务在 wsjson 里存在（线上实测）——结合 login/schwab
// 返回的 accessTokenInfo.refreshToken，可替代 REST 续期路径。
// bundle 枚举名 EXCHANGE_RT_FOR_EAT 佐证语义：refreshToken 换 accessToken。

export type AccessTokenGetRequestParams = {
  refreshToken: string;
  // 真实账户实测（2026-10-14，exp-token-scope.mjs）："api" 成功轮换
  // （accessExpiresIn=86400）；"GENERAL" 被拒 NOT_AUTHORIZED:
  // Unrecognized scope。
  scope: string;
  clientId: string;
};

// 响应形状抄自 bundle 校验 schema（线上实测）。
export type RawPayloadResponseAccessTokenGet = {
  accessExpiresIn: number;
  accessToken: string;
  refreshToken: string;
};

// refreshToken → 新 accessToken（wsjson 通道）。
export default class AccessTokenGetMessageHandler implements WebSocketApiMessageHandler<AccessTokenGetRequestParams> {
  buildRequest({
    refreshToken,
    scope,
    clientId,
  }: AccessTokenGetRequestParams): RawPayloadRequest {
    return newPayload({
      header: { service: "access_token/get", id: "access_token/get", ver: 0 },
      params: { refreshToken, scope, clientId },
    });
  }

  service: ApiService = "access_token/get";
}
