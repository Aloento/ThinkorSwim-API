import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 必填校验："$.params.watchlistId: must not be null"。
// 过校验后仍可能报 "Unexpected server error"（isTerminal，guest screener
// 不可用），成功帧待真实账户。
// 查询条件在前端随 scan_filter 结果扩展，完整形状不可枚举，最小建模如下并
// 留索引签名。
export type ScanQueryGetRequestParams = {
  watchlistId: number;
  // 筛选条件（scan_filter/get 返回的 STOCK/OPTION/... 分组名 → 条件），
  // 完整字段集合不可达，未验证。
  [key: string]: unknown;
};

// 响应体形状不可达，未验证（预期为命中 symbols/结果集）。
export type RawPayloadResponseScanQueryGet = {
  [key: string]: unknown;
};

// screener 查询（在指定 watchlist 范围内执行筛选）。guest 受限，
// 成功帧待真实账户。
export default class ScanQueryGetMessageHandler implements WebSocketApiMessageHandler<ScanQueryGetRequestParams> {
  buildRequest(request: ScanQueryGetRequestParams): RawPayloadRequest {
    return newPayload({
      header: {
        service: "scan_query/get",
        id: "scan_query/get",
        ver: 0,
      },
      params: request,
    });
  }

  service: ApiService = "scan_query/get";
}
