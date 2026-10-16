import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 无可接受披露时 body 为空对象，字段形状未知，保留开放结构。
export type RawPayloadResponseDisclosures = Record<string, unknown>;

// 披露/告知信息。params 为空对象。
export default class DisclosuresMessageHandler implements WebSocketApiMessageHandler<void> {
  buildRequest(_: void): RawPayloadRequest {
    return newPayload({
      header: { service: "disclosures", id: "disclosures", ver: 0 },
      params: {},
    });
  }

  service: ApiService = "disclosures";
}
