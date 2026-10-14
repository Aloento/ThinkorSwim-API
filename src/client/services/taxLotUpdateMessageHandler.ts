import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 税批（tax lot）选择更新。guest 未实测任何一帧（docs/TECHNICAL.md 第三轮：bundle
// 中存在），参数形状抄自前端 bundle（本地录制）
// 调用点，逐字核对：
//   {header:{service:Q.TAX_LOT_UPDATE,id:Q.TAX_LOT_UPDATE,ver:0},
//    params:{refreshToken:t, taxLotInstructions:r}}
// 响应处理（bundle）：{refreshToken, orderStatuses, errorMessage,
// responseType}——refreshToken 随响应回传（滚动刷新），标注未实测。

export type TaxLotInstruction = {
  // 最小建模：指令内含 lot 选择与下单关联信息，完整字段 guest 不可达
  [key: string]: unknown;
};

export type TaxLotUpdateRequestParams = {
  // tax_lot/get 响应携带的 lot 句柄（tax_lot/get 要求"非空串"）
  refreshToken: string;
  taxLotInstructions: TaxLotInstruction[];
};

export type RawPayloadResponseTaxLotUpdate = {
  refreshToken?: string;
  orderStatuses?: unknown[];
  errorMessage?: string;
  responseType?: string;
};

// 税批选择更新（下单时指定成本基础批次的后续确认步骤）。参数来自 bundle
// 调用点，线上帧未实测。
export default class TaxLotUpdateMessageHandler implements WebSocketApiMessageHandler<TaxLotUpdateRequestParams> {
  buildRequest({
    refreshToken,
    taxLotInstructions,
  }: TaxLotUpdateRequestParams): RawPayloadRequest {
    return newPayload({
      header: { service: "tax_lot/update", id: "tax_lot/update", ver: 0 },
      params: { refreshToken, taxLotInstructions },
    });
  }

  service: ApiService = "tax_lot/update";
}
