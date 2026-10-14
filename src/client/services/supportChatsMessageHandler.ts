import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 实测自本地录制（type: snapshot）。
// 实测账号下 body 为空对象（无进行中的客服会话），字段形状未知，保留开放结构。
export type RawPayloadResponseSupportChats = Record<string, unknown>;

// 客服 chat 会话列表。params 实测为空对象。
export default class SupportChatsMessageHandler implements WebSocketApiMessageHandler<void> {
  buildRequest(_: void): RawPayloadRequest {
    return newPayload({
      header: { service: "support_chats", id: "support_chats", ver: 0 },
      params: {},
    });
  }

  service: ApiService = "support_chats";
}
