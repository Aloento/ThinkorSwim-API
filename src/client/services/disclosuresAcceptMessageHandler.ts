import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 服务端校验："$.params.disclosureIds: must not be empty"。
// guest 会话无可接受披露，成功响应形状未验证。
export type DisclosuresAcceptRequestParams = {
  disclosureIds: number[];
};

export type RawPayloadResponseDisclosuresAccept = Record<string, unknown>;

// 接受披露协议（写操作）。
export default class DisclosuresAcceptMessageHandler implements WebSocketApiMessageHandler<DisclosuresAcceptRequestParams> {
  buildRequest({
    disclosureIds,
  }: DisclosuresAcceptRequestParams): RawPayloadRequest {
    return newPayload({
      header: {
        service: "disclosures/accept",
        id: "disclosures/accept",
        ver: 0,
      },
      params: { disclosureIds },
    });
  }

  service: ApiService = "disclosures/accept";
}
