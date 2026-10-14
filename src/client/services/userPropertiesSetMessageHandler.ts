import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 存在但未实测成功形状（本地录制（scripts/probe-services.mjs 可复现）
// user_properties_set.jsonl）：零参数请求也返回 snapshot（空 body），
// 但真实写参数的形状待按需探测（06 号文档第 4 节）。
export type UserPropertiesSetRequestParams = Record<string, unknown>;

export type RawPayloadResponseUserPropertiesSet = Record<string, unknown>;

// 写用户属性（set 版；只读版见 userPropertiesMessageHandler）。
// ⚠️ 参数形状未实测确认：guest 下空对象即返回 snapshot {}。
export default class UserPropertiesSetMessageHandler implements WebSocketApiMessageHandler<UserPropertiesSetRequestParams> {
  buildRequest(args: UserPropertiesSetRequestParams): RawPayloadRequest {
    return newPayload({
      header: {
        service: "user_properties/set",
        id: "user_properties/set",
        ver: 0,
      },
      params: { ...args },
    });
  }

  service: ApiService = "user_properties/set";
}
