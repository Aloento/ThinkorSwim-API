import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// params:{clientId, refreshToken}；响应为终止会话的确认帧 {service, requestId}。
export type LogoffSchwabRequestParams = {
  clientId: string;
  refreshToken: string;
};

// 登出（终止 Schwab 会话）。危险操作：调用后当前 accessToken 对应会话失效。
export default class LogoffSchwabMessageHandler implements WebSocketApiMessageHandler<LogoffSchwabRequestParams> {
  buildRequest({
    clientId,
    refreshToken,
  }: LogoffSchwabRequestParams): RawPayloadRequest {
    return newPayload({
      header: { service: "logoff/schwab", id: "logoff/schwab", ver: 0 },
      params: { clientId, refreshToken },
    });
  }

  service: ApiService = "logoff/schwab";
}
