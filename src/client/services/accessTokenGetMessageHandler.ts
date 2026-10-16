import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 必填校验："$.params.refreshToken: must not be null; $.params.scope: must not
// be null; $.params.clientId: must not be null"。
// refreshToken 换 accessToken（bundle 枚举名 EXCHANGE_RT_FOR_EAT）。

export type AccessTokenGetRequestParams = {
  refreshToken: string;
  // "api" 成功轮换（accessExpiresIn=86400）；"GENERAL" 被拒
  // NOT_AUTHORIZED: Unrecognized scope。
  scope: string;
  clientId: string;
};

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
