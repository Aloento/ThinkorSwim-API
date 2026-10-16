import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 取消订阅：params {targetService, targetRequestId}，服务端按 `service$id`
// 定位订阅；响应 snapshot {targetService,targetRequestId}。订阅已不存在时
// error "No subscription: positions$positions"（isTerminal），经
// WebSocketApiError 通道 reject。id 惯例 `unsubscribe-<targetId>`。
export type UnsubscribeRequestParams = {
  // 原订阅请求的 service 与 id（服务端按 `service$id` 定位订阅）
  targetService: ApiService | string;
  targetRequestId: string;
};

export type RawPayloadResponseUnsubscribe = {
  targetService: string;
  targetRequestId: string;
};

// 取消订阅（资源清理）。
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
