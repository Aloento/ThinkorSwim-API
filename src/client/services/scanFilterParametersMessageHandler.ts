import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 可用参数集合抄自本地录制
// 线上错误帧：
// "Mismatched request parameter name is \"params.filter\". Available
// parameters are [getPatternParameters, fundamentals, studies]"
// ——任务简报里的 {filter} 是错的猜测名，按校验帧为准。
// bundle 调用点与之吻合：params:{fundamentals:t,studies:r}。
export type ScanFilterParametersRequestParams = {
  // 筛选器显示名数组（scan_filter/get 返回的 fundamentals 名）
  fundamentals?: string[];
  // 研究名数组（scan_filter/get 返回的 studies 名）
  studies?: string[];
  getPatternParameters?: boolean;
};

// guest 对合法参数返回空响应（线上实测），响应体形状待真实账户补全；
// 预期为各筛选器的参数定义（screener 查询的构造材料）。
export type RawPayloadResponseScanFilterParameters = {
  [key: string]: unknown;
};

// 筛选器参数目录（构造 scan_query/get 查询前的元数据查询）。
export default class ScanFilterParametersMessageHandler implements WebSocketApiMessageHandler<ScanFilterParametersRequestParams> {
  buildRequest({
    fundamentals,
    studies,
    getPatternParameters,
  }: ScanFilterParametersRequestParams): RawPayloadRequest {
    const params: Record<string, unknown> = {};
    if (fundamentals !== undefined) params.fundamentals = fundamentals;
    if (studies !== undefined) params.studies = studies;
    if (getPatternParameters !== undefined)
      params.getPatternParameters = getPatternParameters;
    return newPayload({
      header: {
        service: "scan_filter/parameters",
        id: "scan_filter/parameters",
        ver: 0,
      },
      params,
    });
  }

  service: ApiService = "scan_filter/parameters";
}
