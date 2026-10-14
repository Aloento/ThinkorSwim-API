import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 真实账户实测修通（2026-10-14，agent/tools/exp-tc.mjs）：只发 {account}
// 报 "Unexpected error during validation"；按 bundle 调用点
// （GET_TRANSACTIONS_CATEGORIES：{startTime,endTime,account,
//   transactionCategories,cryptoTransactionTypes,cashFutureTransactionTypes}）
// 发全 6 参数后 snapshot 成功（equityTransactions[] 现金余额/交易流水，
// 实测 type 含 "BAL"）。guest 下同样报校验错误（早期 06 §4 记载）。
export type TransactionsCategoriesRequestParams = {
  account: string;
  /** epoch 秒（与 order_history 一致） */
  startTime: number;
  endTime: number;
  // 三个过滤数组可空数组（实测 [] 即返回全部）
  transactionCategories?: string[];
  cryptoTransactionTypes?: string[];
  cashFutureTransactionTypes?: string[];
};

// snapshot 实测（exp-tc.mjs）：equityTransactions[] 元素含
// {tradeTime,execTime,type,description,symbol,amount,balance,miscFees,
//  commissionsAndFees}；其他分组（期权/债券流水等）guest/小账户未见，
// 保留索引签名。
export type TransactionsCategoriesEntry = {
  tradeTime?: string;
  execTime?: string;
  type?: string;
  description?: string;
  symbol?: string;
  amount?: number;
  balance?: number;
  miscFees?: number;
  commissionsAndFees?: number;
  [key: string]: unknown;
};

export type RawPayloadResponseTransactionsCategories = {
  equityTransactions?: TransactionsCategoriesEntry[];
  [key: string]: unknown;
};

// 账户交易流水分类目录（transactions 系列）。真实账户实测 snapshot。
export default class TransactionsCategoriesMessageHandler implements WebSocketApiMessageHandler<TransactionsCategoriesRequestParams> {
  buildRequest({
    account,
    startTime,
    endTime,
    transactionCategories = [],
    cryptoTransactionTypes = [],
    cashFutureTransactionTypes = [],
  }: TransactionsCategoriesRequestParams): RawPayloadRequest {
    return newPayload({
      header: {
        service: "transactions/categories",
        id: "transactions/categories",
        ver: 0,
      },
      params: {
        startTime,
        endTime,
        account,
        transactionCategories,
        cryptoTransactionTypes,
        cashFutureTransactionTypes,
      },
    });
  }

  service: ApiService = "transactions/categories";
}
