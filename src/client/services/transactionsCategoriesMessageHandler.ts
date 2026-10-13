import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 存在但未实测成功形状（agent/artifacts/probe-2026-10-13/
// transactions_categories.jsonl）：guest 下报 "Unexpected error during
// validation"（服务在校验层被识别，非 Undefined service），真实账户待测。
export type TransactionsCategoriesRequestParams = {
  // probe 实测发送过 "COMBINED ACCOUNT"（guest 报校验错误，无法确认约束；
  // 若失败可换真实账户 code，参照 order_history）
  account: string;
};

export type RawPayloadResponseTransactionsCategories = Record<string, unknown>;

// 交易分类目录（transactions 系列，真实账户待测）。
export default class TransactionsCategoriesMessageHandler implements WebSocketApiMessageHandler<TransactionsCategoriesRequestParams> {
  buildRequest({
    account,
  }: TransactionsCategoriesRequestParams): RawPayloadRequest {
    return newPayload({
      header: {
        service: "transactions/categories",
        id: "transactions/categories",
        ver: 0,
      },
      params: { account },
    });
  }

  service: ApiService = "transactions/categories";
}
