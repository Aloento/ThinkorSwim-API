import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 参数逐字抄自前端 bundle（agent/artifacts/frontend-index.js）调用点：
//   params:{queryName, watchlistType, allGroupFilters, noneGroupFilters,
//           anyGroupFilters, filterMode, scanInWatchlist, limit(默认 1000), sort}
// 响应形状 guest 不可达（screener 权限受限，agent/06 第五轮），线上帧未实测。

export type ScanQuerySaveRequestParams = {
  queryName: string;
  // bundle 未枚举取值（筛选范围类型），未实测
  watchlistType: string;
  allGroupFilters: unknown[];
  noneGroupFilters: unknown[];
  anyGroupFilters: unknown[];
  filterMode: string;
  scanInWatchlist: boolean;
  limit?: number;
  sort?: string;
};

export type RawPayloadResponseScanQuerySave = {
  [key: string]: unknown;
};

// 保存 screener 查询（scan_query/get 的配套写服务）。
export default class ScanQuerySaveMessageHandler implements WebSocketApiMessageHandler<ScanQuerySaveRequestParams> {
  buildRequest({
    queryName,
    watchlistType,
    allGroupFilters,
    noneGroupFilters,
    anyGroupFilters,
    filterMode,
    scanInWatchlist,
    limit = 1000,
    sort,
  }: ScanQuerySaveRequestParams): RawPayloadRequest {
    const params: Record<string, unknown> = {
      queryName,
      watchlistType,
      allGroupFilters,
      noneGroupFilters,
      anyGroupFilters,
      filterMode,
      scanInWatchlist,
      limit,
    };
    if (sort !== undefined) params.sort = sort;
    return newPayload({
      header: { service: "scan_query/save", id: "scan_query/save", ver: 0 },
      params,
    });
  }

  service: ApiService = "scan_query/save";
}
