import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import {
  buildPlaceOrderEntry,
  PlaceOrderRequestParams,
} from "./placeOrderMessageHandler.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

export type SubmitDraftOrderRequestParams = PlaceOrderRequestParams;

// 改单：refOrderId 必填（区别于提交草稿的新单）。
// 注意不要用 Required<PlaceOrderRequestParams>——Required 对判别联合的
// `limitPrice?: never` 会变成必填 never（不可构造），改为交集收紧 refOrderId。
export type ReplaceOrderRequestParams = PlaceOrderRequestParams & {
  refOrderId: number;
};

// 提交订单草稿（新单）或修改已存在的订单（带 refOrderId）。
//
// 实测（agent/tools/probe-write.mjs W2/W3 用例，agent/06 第 3 节）：
// - 新单（W2）：action=SUBMIT ver=0，header 必须复用 CONFIRM 的草稿 id
//   （update-draft-order-<SYMBOL>）；换 id 报
//   "Can not submit while prices are not available!"。
//   requestType=INIT_STOCK，带 tif/tag。orderId 不在 snapshot 里，而是
//   SUBMIT 后经 patch /orders/0/orderId 返回。
// - 改单（W3）：action=SUBMIT ver=0，header.id 是新造的
//   edit-order-<SYMBOL>（编辑不是草稿续写，不要求复用下单草稿 id），
//   订单条目 requestType=EDIT_ORDER 且携带 refOrderId。
// orderType/limitPrice/stopPrice/tif 与 CONFIRM 共用 buildPlaceOrderEntry
// （MARKET/STOP/STOP_LIMIT 扩展，task-10）；SUBMIT 缺省 tif=DAY +
// tag=TOSWeb（W2 实测形状）。
// ⚠️ MARKET 单 SUBMIT 会立即成交——下单前确认。
export default class SubmitOrderMessageHandler implements WebSocketApiMessageHandler<PlaceOrderRequestParams> {
  buildRequest(params: PlaceOrderRequestParams): RawPayloadRequest {
    const { symbol, refOrderId } = params;
    const isEdit = refOrderId !== undefined;
    return newPayload({
      header: {
        id: isEdit ? `edit-order-${symbol}` : `update-draft-order-${symbol}`,
        service: "place_order",
        ver: 0,
      },
      params: {
        accountCode: params.accountNumber,
        action: "SUBMIT",
        marker: "SINGLE",
        orders: [
          buildPlaceOrderEntry(params, isEdit ? "EDIT_ORDER" : "INIT_STOCK", {
            defaultTif: "DAY",
            tag: "TOSWeb",
          }),
        ],
      },
    });
  }

  service: ApiService = "place_order";
}
