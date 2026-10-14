import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 实测自 本地录制（scripts/probe-services.mjs 可复现）（type: snapshot）。
// 实测账号下 body 为空对象，字段形状未知，保留开放结构。
export type RawPayloadResponseDisclosures = Record<string, unknown>;

// 披露/告知信息。params 实测为空对象。
export default class DisclosuresMessageHandler implements WebSocketApiMessageHandler<void> {
  buildRequest(_: void): RawPayloadRequest {
    return newPayload({
      header: { service: "disclosures", id: "disclosures", ver: 0 },
      params: {},
    });
  }

  service: ApiService = "disclosures";
}
