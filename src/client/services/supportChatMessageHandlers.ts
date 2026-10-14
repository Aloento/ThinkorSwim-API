import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 客服聊天全套（docs/TECHNICAL.md 第 4 节：bundle 中确认存在）。参数逐字抄自前端
// bundle（本地录制）调用点：
//   chat/create            params:{channel, newChatName, body}
//                          响应 {succeeded, chatRoom:{chatId,name,status,
//                                chatBroadcastingActivity,userCount}}
//   chat/close             params:{chatId}
//   chat/send_message      params:{targetId, body}（targetId 即 chatId）
//                          响应 {succeeded, messageId}
//   support_chat/messages  params:{chatId}，响应 {chatRoom}
// 均为 bundle 证据，线上帧未实测（guest 无客服会话）。

export type SupportChatRoom = {
  chatId: number;
  name?: string;
  // bundle schema：status/chatBroadcastingActivity 为字符串枚举，取值未实测
  status?: string;
  chatBroadcastingActivity?: string;
  userCount?: number;
  [key: string]: unknown;
};

export type ChatCreateRequestParams = {
  // bundle 传会话渠道标识，guest 未实测取值
  channel: string;
  newChatName: string;
  body: string;
  // bundle 里 id 为动态 requestId（并发区分响应）；缺省用静态 id
  requestId?: string;
};

export type ChatCreateResponse = {
  succeeded: boolean;
  chatRoom: SupportChatRoom;
};

export type ChatCloseRequestParams = {
  chatId: number;
};

export type ChatSendMessageRequestParams = {
  targetId: number;
  body: string;
};

export type ChatSendMessageResponse = {
  succeeded: boolean;
  messageId: number;
};

export type SupportChatMessagesRequestParams = {
  chatId: number;
};

export type SupportChatMessagesResponse = {
  chatRoom: SupportChatRoom;
};

export default class ChatCreateMessageHandler implements WebSocketApiMessageHandler<ChatCreateRequestParams> {
  buildRequest({
    channel,
    newChatName,
    body,
    requestId,
  }: ChatCreateRequestParams): RawPayloadRequest {
    return newPayload({
      header: {
        service: "chat/create",
        id: requestId ?? "chat/create",
        ver: 0,
      },
      params: { channel, newChatName, body },
    });
  }

  service: ApiService = "chat/create";
}

export class ChatCloseMessageHandler implements WebSocketApiMessageHandler<ChatCloseRequestParams> {
  buildRequest({ chatId }: ChatCloseRequestParams): RawPayloadRequest {
    return newPayload({
      header: { service: "chat/close", id: "chat/close", ver: 0 },
      params: { chatId },
    });
  }

  service: ApiService = "chat/close";
}

export class ChatSendMessageMessageHandler implements WebSocketApiMessageHandler<ChatSendMessageRequestParams> {
  buildRequest({
    targetId,
    body,
  }: ChatSendMessageRequestParams): RawPayloadRequest {
    return newPayload({
      header: { service: "chat/send_message", id: "chat/send_message", ver: 0 },
      params: { targetId, body },
    });
  }

  service: ApiService = "chat/send_message";
}

export class SupportChatMessagesMessageHandler implements WebSocketApiMessageHandler<SupportChatMessagesRequestParams> {
  buildRequest({
    chatId,
  }: SupportChatMessagesRequestParams): RawPayloadRequest {
    return newPayload({
      header: {
        service: "support_chat/messages",
        id: "support_chat/messages",
        ver: 0,
      },
      params: { chatId },
    });
  }

  service: ApiService = "support_chat/messages";
}
