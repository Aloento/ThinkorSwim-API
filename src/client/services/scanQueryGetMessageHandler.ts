import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 必填校验抄自 agent/artifacts/probe-2026-10-13/scan_query_get.jsonl：
// "$.params.watchlistId: must not be null"。guest 传 watchlistId=100 过
// 校验但报 "Unexpected server error"（isTerminal，agent/06 第五轮：guest
// screener 不可用），成功帧待真实账户。
// bundle 调用点：params:{watchlistId:t}，id 动态
// （`scan_query/get-${随机}`）——screener 查询条件在 bundle 里随
// scan_filter 结果扩展，guest 无法枚举完整形状，最小建模如下并留索引签名。
export type ScanQueryGetRequestParams = {
  watchlistId: number;
  // 筛选条件（scan_filter/get 返回的 STOCK/OPTION/... 分组名 → 条件），
  // 完整字段集合 guest 不可达，未验证。
  [key: string]: unknown;
};

// 响应体形状 guest 不可达，未验证（预期为命中 symbols/结果集）。
export type RawPayloadResponseScanQueryGet = {
  [key: string]: unknown;
};

// screener 查询（在指定 watchlist 范围内执行筛选）。guest 受限，
// params 按校验帧写全，成功帧待真实账户。
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
