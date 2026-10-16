import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

export type StudiesGetRequestParams = {
  // 必须是非空的**真实研究名**（如 "SimpleMovingAvg"）。
  // 简写（"SMA"）报 error "No study with name: SMA,VOL"；
  // 空数组报 "$.params.studies: must not be empty"。
  studies: string[];
};

// plotSettings（paintingStyles/curveStyles/defaultValue 等）结构庞大且稳定，
// 按需读取，不逐字段建模。
export type StudyPlotJTOS = {
  name: string;
  width?: number;
  color?: { r: number; g: number; b: number; alpha: number };
  plotSettings?: Record<string, unknown>;
};

export type StudiesGetResponseItem = {
  name: string;
  plots?: StudyPlotJTOS[];
  parameters?: Record<string, unknown>;
  parametersInfo?: unknown;
};

export type RawPayloadResponseStudiesGet = {
  studiesGetResponseJTOS: StudiesGetResponseItem[];
};

// 查询研究（study）的元数据定义（plots/参数说明），单次 snapshot。
export default class StudiesGetMessageHandler implements WebSocketApiMessageHandler<StudiesGetRequestParams> {
  buildRequest({ studies }: StudiesGetRequestParams): RawPayloadRequest {
    return newPayload({
      header: { service: "studies/get", id: "studies/get", ver: 0 },
      params: { studies },
    });
  }

  service: ApiService = "studies/get";
}
