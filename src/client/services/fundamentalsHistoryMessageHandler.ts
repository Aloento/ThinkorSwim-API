import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import { FundamentalsField } from "./fundamentalsCurrentMessageHandler.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 参数实测自前端 bundle（agent/artifacts/frontend-index.js）调用点：
//   {header:{service:Q.FUNDAMENTALS_HISTORY,...},params:{symbol:t,fields:r,time:n}}
// ——与 fundamentals/current 同参数名（symbol/fields/time）；wsjson 校验帧
// （fundamentals_history.jsonl）里 params.time 报 "Mismatched request
// parameter name"，与 bundle 矛盾，疑因 guest 权限路径不同——待真实账户
// 复核。fields 枚举复用 fundamentals/current 全量清单。
export type FundamentalsHistoryRequestParams = {
  symbol: string;
  // 与 current 一致传 "QUARTERLY"（bundle 同源）；待真实账户确认
  time: string;
  fields: FundamentalsField[];
};

// 响应形状抄自 bundle 响应处理代码：
//   const a=o.annualValues, i=o.quarterlyValues, l={symbol, annualValues:a, quarterlyValues:i}
// 成功帧未实测（guest 校验帧都过不去，agent/06 第五轮）。
export type RawPayloadResponseFundamentalsHistory = {
  symbol: string;
  annualValues?: Partial<Record<FundamentalsField, string | number | null>>;
  quarterlyValues?: Partial<Record<FundamentalsField, string | number | null>>;
};

// 历史基本面数据（按年度/季度序列）。guest 校验帧未过，成功帧待真实账户。
export default class FundamentalsHistoryMessageHandler implements WebSocketApiMessageHandler<FundamentalsHistoryRequestParams> {
  buildRequest({
    symbol,
    time,
    fields,
  }: FundamentalsHistoryRequestParams): RawPayloadRequest {
    return newPayload({
      header: {
        service: "fundamentals/history",
        id: "fundamentals/history",
        ver: 0,
      },
      params: { symbol, fields, time },
    });
  }

  service: ApiService = "fundamentals/history";
}
