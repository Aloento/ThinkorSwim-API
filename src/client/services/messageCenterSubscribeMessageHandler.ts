import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

export const DEFAULT_MESSAGE_CENTER_ALERT_TYPES = ["ALL_MESSAGES"];

// 响应未实测：参数形状未黑盒确认（probe 目录无 message_center/subscribe 帧）。
// 参照 alerts/subscribe 的 { alertTypes } 模式编写，字段名以 "ALL_MESSAGES"
// 为默认值，实际可用性待后续黑盒验证。
export type RawPayloadResponseMessageCenterSubscribe = Record<string, unknown>;

// 消息中心：订阅消息推送。参数形状未黑盒确认，见上方注释。
export default class MessageCenterSubscribeMessageHandler implements WebSocketApiMessageHandler<
  string[]
> {
  buildRequest(
    alertTypes: string[] = DEFAULT_MESSAGE_CENTER_ALERT_TYPES,
  ): RawPayloadRequest {
    return newPayload({
      header: {
        service: "message_center/subscribe",
        id: "message_center_subscribe",
        ver: 0,
      },
      params: { alertTypes },
    });
  }

  service: ApiService = "message_center/subscribe";
}
