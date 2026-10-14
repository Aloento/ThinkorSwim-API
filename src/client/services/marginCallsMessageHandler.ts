import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 实测自 本地录制（type: snapshot）。
// 实测时 marginCalls 均为空数组，元素结构未观测到，故为 unknown[]。
export type RawMarginAccountsDataItem = {
  account: string;
  marginCalls: unknown[];
};

export type RawPayloadResponseMarginCalls = {
  marginAccountsDataItems: RawMarginAccountsDataItem[];
};

// 保证金追缴列表。params 实测为空对象。
export default class MarginCallsMessageHandler implements WebSocketApiMessageHandler<void> {
  buildRequest(_: void): RawPayloadRequest {
    return newPayload({
      header: { service: "margin_calls", id: "margin-calls", ver: 0 },
      params: {},
    });
  }

  service: ApiService = "margin_calls";
}
