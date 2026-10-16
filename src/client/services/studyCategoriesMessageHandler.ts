import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 响应 categories[]{name, studies[]}——26 个分类、441 个研究指标全清单
// （chart 研究功能的服务端目录）。零参数（params {}）。
export type StudyCategoryItem = {
  name: string;
  studies: string[];
};

export type RawPayloadResponseStudyCategories = {
  categories: StudyCategoryItem[];
};

// 研究指标目录（chart 研究清单，配合 studies/get 与 study/subscribe 用）。
export default class StudyCategoriesMessageHandler implements WebSocketApiMessageHandler<void> {
  buildRequest(_: void): RawPayloadRequest {
    return newPayload({
      header: { service: "study/categories", id: "study/categories", ver: 0 },
      params: {},
    });
  }

  service: ApiService = "study/categories";
}
