import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// type 可用枚举：[STUDY, PUBLIC, CUSTOM]，非法值报
// "Mismatched request parameter name is \"params.type\". Possible enum
// values are [STUDY, PUBLIC, CUSTOM]"。
const STUDY_TYPES = ["STUDY", "PUBLIC", "CUSTOM"] as const;

export type StudySubscribeType = (typeof STUDY_TYPES)[number];

// studies[].aggregationPeriod 必填，缺失报
// "$.params.studies[0].aggregationPeriod: must not be null"；枚举全量 24 项：
// [MIN1, MIN2, MIN3, MIN4, MIN5, MIN10, MIN15, MIN20, MIN30, HOUR1, HOUR2,
// HOUR4, HOUR6, HOUR12, HOUR24, DAY, DAY2, DAY3, DAY4, WEEK, MONTH, OPT_EXP,
// QUARTER, YEAR]。
export type StudyAggregationPeriod =
  | "MIN1"
  | "MIN2"
  | "MIN3"
  | "MIN4"
  | "MIN5"
  | "MIN10"
  | "MIN15"
  | "MIN20"
  | "MIN30"
  | "HOUR1"
  | "HOUR2"
  | "HOUR4"
  | "HOUR6"
  | "HOUR12"
  | "HOUR24"
  | "DAY"
  | "DAY2"
  | "DAY3"
  | "DAY4"
  | "WEEK"
  | "MONTH"
  | "OPT_EXP"
  | "QUARTER"
  | "YEAR";

// 必填校验："$.params.symbols: must not be empty;
// $.params.type: must not be null; $.params.studies: must not be empty;
// $.params.studies[0].aggregationPeriod: must not be null"。
// studies 元素可用参数：[plot, parameters, name, aggregationPeriod]。
// plot 传数组报 "Mismatched request parameter name is
// \"params.studies.plot\""，故不发。
// parameters 必须给出（空对象 {} 可行；省略时枚举内值也报 Unexpected server
// error），保守为必填。
export type StudySubscribeItem = {
  // 真实研究名（同 studies/get），如 "SimpleMovingAvg"
  name: string;
  aggregationPeriod: StudyAggregationPeriod;
  // 研究参数（如 {length: 20}）；无参数研究传 {}。
  parameters: Record<string, unknown>;
};

export type StudySubscribeRequestParams = {
  symbols: string[];
  type: StudySubscribeType;
  studies: StudySubscribeItem[];
};

// 响应：values[symbol][研究名] = 数值，
// 如 {"values":{"AAPL":{"SimpleMovingAvg":336.289}}}。
export type RawPayloadResponseStudySubscribe = {
  values: Record<string, Record<string, number>>;
};

// 指标数值订阅（推送流）。aggregationPeriod/parameters 为服务端必填，
// 缺失会被校验层拒绝。CUSTOM 类型对不存在的脚本报
// "Unknown custom script: <name>"（非权限问题）。
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
