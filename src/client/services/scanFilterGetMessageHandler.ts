import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 成功帧实测自 本地录制
// （type: snapshot）。响应四类分组：STOCK/OPTION/FUNDAMENTAL 为 filters[]
// （人类可读筛选器名），STUDY 为 studies{分类名: 研究名[]}。
export type ScanFiltersByType = {
  STOCK?: { filters: string[] };
  OPTION?: { filters: string[] };
  FUNDAMENTAL?: { filters: string[] };
  STUDY?: { studies: Record<string, string[]> };
};

export type RawPayloadResponseScanFilterGet = {
  scanFilters: ScanFiltersByType;
};

// bundle 调用点（本地录制）：
//   {service:Q.SCAN_FILTER_GET,...},params:{categories:t}
// 空参 {} 实测也成功（返回全部分组）；categories 用于只取部分分组，
// guest 未实测过滤效果。
export type ScanFilterGetRequestParams = {
  categories?: (keyof ScanFiltersByType)[];
};

// web 版 screener 的筛选器目录（screener 功能第一步）。
export default class ScanFilterGetMessageHandler implements WebSocketApiMessageHandler<ScanFilterGetRequestParams | void> {
  buildRequest(args: ScanFilterGetRequestParams | void): RawPayloadRequest {
    const params =
      args && typeof args === "object" && args.categories
        ? { categories: args.categories }
        : {};
    return newPayload({
      header: {
        service: "scan_filter/get",
        id: "scan_filter/get",
        ver: 0,
      },
      params,
    });
  }

  service: ApiService = "scan_filter/get";
}
