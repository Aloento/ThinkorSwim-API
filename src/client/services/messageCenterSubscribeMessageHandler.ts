import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 实测（probe-2026-10-13/message_center_subscribe.jsonl 错误帧）：
// 服务端明确 "No parameters are expected"——发送 alertTypes/messageTypes 均报
// "Mismatched request parameter name"。订阅即建立推送，无可调参数。
// 响应未实测（订阅成功的推送形态待有消息时补测）。
export type RawPayloadResponseMessageCenterSubscribe = Record<string, unknown>;

// 消息中心：订阅消息推送。服务端不接受任何参数。
export default class MessageCenterSubscribeMessageHandler implements WebSocketApiMessageHandler<void> {
  buildRequest(_: void): RawPayloadRequest {
    return newPayload({
      header: {
        service: "message_center/subscribe",
        id: "message_center_subscribe",
        ver: 0,
      },
      params: {},
    });
  }

  service: ApiService = "message_center/subscribe";
}
