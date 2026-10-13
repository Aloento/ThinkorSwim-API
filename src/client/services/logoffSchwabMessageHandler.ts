import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 参数抄自前端 bundle（agent/artifacts/frontend-index.js）调用点，逐字核对：
//   {header:{service:"logoff/schwab",id:"logoff/schwab",ver:0},
//    params:{clientId:t, refreshToken:r}}
// bundle 响应校验只声明 {service, requestId}——预期为终止服务端会话的
// 确认帧。⚠️ 06 第三轮：会终止会话，勿乱测。
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
