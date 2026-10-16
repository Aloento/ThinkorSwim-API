import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 分析师报告第三方服务的访问 token。零参数，
// 响应 {uuid, accessToken, grantType, refreshIntervalMillis}。
export type RawPayloadResponseAnalystReportsToken = {
  uuid: string;
  accessToken: string;
  // "Bearer"
  grantType: string;
  refreshIntervalMillis: number;
};

export default class AnalystReportsTokenMessageHandler implements WebSocketApiMessageHandler<void> {
  buildRequest(_: void): RawPayloadRequest {
    return newPayload({
      header: {
        service: "analyst_reports/token",
        id: "analyst_reports/token",
        ver: 0,
      },
      params: {},
    });
  }

  service: ApiService = "analyst_reports/token";
}
