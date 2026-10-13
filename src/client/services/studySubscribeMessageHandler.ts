import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 枚举抄自 agent/artifacts/probe-2026-10-13/study_subscribe.jsonl 错误帧：
// "Mismatched request parameter name is \"params.type\". Possible enum
// values are [STUDY, PUBLIC, CUSTOM]"。
const STUDY_TYPES = ["STUDY", "PUBLIC", "CUSTOM"] as const;

export type StudySubscribeType = (typeof STUDY_TYPES)[number];

// 必填校验抄自同文件错误帧："$.params.symbols: must not be empty;
// $.params.type: must not be null; $.params.studies: must not be empty"。
// studies 元素的确切结构 guest 跑不通（"params.studies" 格式错误，agent/06
// 第五轮）——bundle 调用点里 studies 元素为 {name, parameters|values, ...}
// 形状（含 type/isLowerChart 等运行时字段），此处按最小形状建模并标注。
export type StudySubscribeItem = {
  // 真实研究名（同 studies/get），如 "SimpleMovingAvg"
  name: string;
  [key: string]: unknown;
};

export type StudySubscribeRequestParams = {
  symbols: string[];
  type: StudySubscribeType;
  studies: StudySubscribeItem[];
};

// 指标数值订阅（推送流）。guest 权限受限——参数全对仍跑不通 studies 元素
// （agent/06 第五轮），成功帧待真实账户；params 按校验帧写全。
export default class StudySubscribeMessageHandler implements WebSocketApiMessageHandler<StudySubscribeRequestParams> {
  buildRequest({
    symbols,
    type,
    studies,
  }: StudySubscribeRequestParams): RawPayloadRequest {
    return newPayload({
      header: {
        service: "study/subscribe",
        id: "study/subscribe",
        ver: 0,
      },
      params: { symbols, type, studies },
    });
  }

  service: ApiService = "study/subscribe";
}
