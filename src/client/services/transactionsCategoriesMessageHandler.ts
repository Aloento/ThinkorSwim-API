import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 六个参数全发：只发 {account} 报 "Unexpected error during validation"。
export type TransactionsCategoriesRequestParams = {
  account: string;
  /** epoch 秒（与 order_history 一致） */
  startTime: number;
  endTime: number;
  // 三个过滤数组可传 []（[] 即返回全部）
  transactionCategories?: string[];
  cryptoTransactionTypes?: string[];
  cashFutureTransactionTypes?: string[];
};

// snapshot：equityTransactions[] 元素含
// {tradeTime,execTime,type,description,symbol,amount,balance,miscFees,
//  commissionsAndFees}；type 已见 "BAL"。其他分组（期权/债券流水等）
// 小账户未见，保留索引签名。
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

// 账户交易流水分类目录（transactions 系列）。
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
