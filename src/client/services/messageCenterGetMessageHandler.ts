import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 实测自本地录制（type: snapshot）。
// 实测账号下 body 为空对象，字段形状未知，保留开放结构。
export type RawPayloadResponseMessageCenter = Record<string, unknown>;

// 消息中心：获取现有消息。service 名带命名空间 "message_center/get"。
// params 实测为空对象。
export default class MessageCenterGetMessageHandler implements WebSocketApiMessageHandler<void> {
  buildRequest(_: void): RawPayloadRequest {
    return newPayload({
      header: {
        service: "message_center/get",
        id: "message_center_get",
        ver: 0,
      },
      params: {},
    });
  }

  service: ApiService = "message_center/get";
}
