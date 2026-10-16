import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 无进行中的客服会话时 body 为空对象，字段形状未知，保留开放结构。
export type RawPayloadResponseSupportChats = Record<string, unknown>;

// 客服 chat 会话列表。params 为空对象。
export default class SupportChatsMessageHandler implements WebSocketApiMessageHandler<void> {
  buildRequest(_: void): RawPayloadRequest {
    return newPayload({
      header: { service: "support_chats", id: "support_chats", ver: 0 },
      params: {},
    });
  }

  service: ApiService = "support_chats";
}
