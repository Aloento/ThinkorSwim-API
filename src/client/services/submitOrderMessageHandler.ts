import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import { PlaceLimitOrderRequestParams } from "./placeOrderMessageHandler.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

export type SubmitDraftOrderRequestParams = PlaceLimitOrderRequestParams;

// 改单：refOrderId 必填（区别于提交草稿的新单）。
export type ReplaceOrderRequestParams = Required<PlaceLimitOrderRequestParams>;

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
// ReqType 用 refOrderId 可选的 PlaceLimitOrderRequestParams：新单（submitOrder，
// refOrderId 省略）与改单（replaceOrder，refOrderId 必填，Required<X> 可赋值给
// X）共用本 handler，内部按 refOrderId 是否给出分支。
export default class SubmitOrderMessageHandler implements WebSocketApiMessageHandler<PlaceLimitOrderRequestParams> {
  buildRequest({
    accountNumber,
    limitPrice,
    symbol,
    quantity,
    refOrderId,
  }: PlaceLimitOrderRequestParams): RawPayloadRequest {
    const isEdit = refOrderId !== undefined;
    return newPayload({
      header: {
        id: isEdit ? `edit-order-${symbol}` : `update-draft-order-${symbol}`,
        service: "place_order",
        ver: 0,
      },
      params: {
        accountCode: accountNumber,
        action: "SUBMIT",
        marker: "SINGLE",
        orders: [
          {
            requestType: isEdit ? "EDIT_ORDER" : "INIT_STOCK",
            ...(isEdit ? { refOrderId } : {}),
            orderType: "LIMIT",
            tif: "DAY",
            limitPrice,
            legs: [{ symbol, quantity }],
            tag: "TOSWeb",
          },
        ],
      },
    });
  }

  service: ApiService = "place_order";
}
