import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 枚举抄自 本地录制（scripts/probe-services.mjs 可复现） 错误帧：
// "Mismatched request parameter name is \"params.type\". Possible enum
// values are [STUDY, PUBLIC, CUSTOM]"。
const STUDY_TYPES = ["STUDY", "PUBLIC", "CUSTOM"] as const;

export type StudySubscribeType = (typeof STUDY_TYPES)[number];

// task-17（本地录制（scripts/probe-services.mjs 可复现））实测：studies 元素
// 缺 aggregationPeriod 报 "$.params.studies[0].aggregationPeriod: must not be
// null"；非法值错误帧自曝枚举全量 24 项：
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

// 必填校验抄自错误帧（两轮合并）："$.params.symbols: must not be empty;
// $.params.type: must not be null; $.params.studies: must not be empty;
// $.params.studies[0].aggregationPeriod: must not be null"。
// 元素可用参数（round2 错误帧自曝）：[plot, parameters, name,
// aggregationPeriod]——但 plot 传数组报 "Mismatched request parameter name
// is \"params.studies.plot\""（round2 t17b-8），guest 下不可用，不发。
// parameters 实测必须给出（空对象 {} 可行，round3 t17c-1 snapshot 成功；
// 省略时枚举内值也报 Unexpected server error——保守为必填）。
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

// 响应形状实测（exp-t17 round2/3 snapshot）：
// {"values":{"AAPL":{"SimpleMovingAvg":336.289}}}——symbol → 研究名 → 数值。
export type RawPayloadResponseStudySubscribe = {
  values: Record<string, Record<string, number>>;
};

// 指标数值订阅（推送流）。task-17 修通：此前 studies 元素缺服务端必填的
// aggregationPeriod/parameters，全部请求被校验层拒绝（并非 guest 权限
// 受限——06 第五轮的"受限"判断作废，见 06 第七轮补充）。CUSTOM 类型对
// 不存在的脚本报 "Unknown custom script: <name>"（round3 t17c-2，非权限）。
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
