import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 实测线上帧（agent/artifacts/watch2-console.txt，前端真实流量）：
//   → {"service":"unsubscribe","id":"unsubscribe-positions","ver":0}
//     params {"targetRequestId":"positions","targetService":"positions"}
//   ← snapshot {"targetService":"support_chats","targetRequestId":"..."}
//   ← error  "No subscription: positions$positions"（isTerminal，订阅已
//     不存在时）——error 帧经 task-1 的 WebSocketApiError 通道 reject。
export type UnsubscribeRequestParams = {
  // 原订阅请求的 service 与 id（服务端按 `service$id` 定位订阅）
  targetService: ApiService | string;
  targetRequestId: string;
};

export type RawPayloadResponseUnsubscribe = {
  targetService: string;
  targetRequestId: string;
};

// 取消订阅（资源清理）。bundle 里 id 惯例 `unsubscribe-<targetId>`。
export default class UnsubscribeMessageHandler implements WebSocketApiMessageHandler<UnsubscribeRequestParams> {
  buildRequest({
    targetService,
    targetRequestId,
  }: UnsubscribeRequestParams): RawPayloadRequest {
    return newPayload({
      header: {
        service: "unsubscribe",
        id: `unsubscribe-${targetRequestId}`,
        ver: 0,
      },
      params: { targetService, targetRequestId },
    });
  }

  service: ApiService = "unsubscribe";
}
