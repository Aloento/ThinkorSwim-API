import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 实测校验（本地录制（scripts/probe-services.mjs 可复现））：
// "$.params.disclosureIds: must not be empty"。guest 会话无可接受披露，
// 成功响应形状未实测（06 号文档：存在但"guest 无披露可接受"）。
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
