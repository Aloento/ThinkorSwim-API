import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 实测自 agent/artifacts/probe-2026-10-13/chat_global_messages.jsonl（type: snapshot）。
export type ChatGlobalMessageHours = {
  open: boolean;
  fromTime: string;
  toTime: string;
};

export type RawPayloadResponseChatGlobalMessages = {
  // 实测 key: "CLOSED" | "INCLUDE_SUPPORT_NUMBER" | "OPEN" | "WARNING_MESSAGE_ON"，
  // 值为 html 字符串或 "true"/"false" 字符串。
  messages: Record<string, string>;
  // 例如 "mo_07:00-mo_17:00,tu_07:00-tu_17:00,..."
  hoursSchedule: string;
  // 实测 key 为星期大写英文（"SUNDAY".."SATURDAY"）
  chatHours: Record<string, ChatGlobalMessageHours>;
};

// 交易台 chat 全局公告/服务时间。params 实测为空对象。
export default class ChatGlobalMessagesMessageHandler implements WebSocketApiMessageHandler<void> {
  buildRequest(_: void): RawPayloadRequest {
    return newPayload({
      header: {
        service: "chat_global/messages",
        id: "chat_global_messages",
        ver: 0,
      },
      params: {},
    });
  }

  service: ApiService = "chat_global/messages";
}
