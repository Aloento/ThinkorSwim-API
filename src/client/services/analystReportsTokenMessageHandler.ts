import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 成功帧实测自 agent/artifacts/probe-2026-10-13/analyst_reports_token.jsonl
// （type: snapshot）：{uuid, accessToken, grantType, refreshIntervalMillis}
// ——分析师报告第三方服务的访问 token，零参数。
export type RawPayloadResponseAnalystReportsToken = {
  uuid: string;
  accessToken: string;
  // 实测值 "Bearer"
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
