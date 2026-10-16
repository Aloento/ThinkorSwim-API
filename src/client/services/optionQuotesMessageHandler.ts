import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// body 顶层为 items + exchanges；items[].symbol 形如 ".AAPL261014C245"。
export type RawOptionQuotesSnapshotBodyResponse = {
  items: OptionQuoteItem[];
  exchanges: string[];
};

export type OptionQuoteItem = {
  symbol: string;
  values: OptionQuoteItemValue;
};

export type OptionQuoteItemValue = {
  ASK?: number;
  BID?: number;
  DELTA?: number;
  OPEN_INT?: number;
  PROBABILITY_ITM?: number;
  VOLUME?: number;
  IMPLIED_VOLATILITY?: number;
};

export type OptionQuotesFilter = {
  seriesNames?: string[];
  // 服务端校验："Either strikeQuantity or both minStrike and maxStrike must be
  // specified"
  strikeQuantity?: number;
  minStrike?: number;
  maxStrike?: number;
};

export type OptionQuotesRequestParams = {
  underlyingSymbol: string;
  seriesNames?: string[];
  minStrike?: number;
  maxStrike?: number;
  strikeQuantity?: number;
};

export default class OptionQuotesMessageHandler implements WebSocketApiMessageHandler<OptionQuotesRequestParams> {
  buildRequest({
    underlyingSymbol,
    seriesNames,
    minStrike,
    maxStrike,
    strikeQuantity,
  }: OptionQuotesRequestParams): RawPayloadRequest {
    if (
      strikeQuantity === undefined &&
      (minStrike === undefined || maxStrike === undefined)
    ) {
      throw new Error(
        "optionQuotes filter requires either strikeQuantity or both minStrike and maxStrike",
      );
    }

    const filter: OptionQuotesFilter = { minStrike, maxStrike };
    if (strikeQuantity !== undefined) filter.strikeQuantity = strikeQuantity;
    if (seriesNames !== undefined) filter.seriesNames = seriesNames;

    return newPayload({
      header: { service: "quotes/options", id: "quotes/options", ver: 0 },
      params: {
        underlyingSymbol,
        exchange: "BEST",
        fields: [
          "BID",
          "ASK",
          "PROBABILITY_ITM",
          "DELTA",
          "OPEN_INT",
          "VOLUME",
        ],
        filter,
      },
    });
  }

  service: ApiService = "quotes/options";
}
