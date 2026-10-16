import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 服务存在，但真实写参数形状未确认：零参数请求也返回 snapshot（空 body）。
export type UserPropertiesSetRequestParams = Record<string, unknown>;

export type RawPayloadResponseUserPropertiesSet = Record<string, unknown>;

// 写用户属性（set 版；只读版见 userPropertiesMessageHandler）。
// 参数形状未确认：guest 下空对象即返回 snapshot {}。
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
