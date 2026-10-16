import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler from "./webSocketApiMessageHandler.js";

export type RawOptionChainDetailsResponse = {
  optionSeries: OptionChainDetailsItem[];
};

export type OptionChainDetailsItem = {
  expiration: string; // eg "16 JUN 23"
  expirationString: string; // eg "16 JUN 23 (100)"
  fractionalType: string; // eg X10
  optionPairs: {
    strike: number;
    callSymbol: string;
    putSymbol: string;
    callDisplaySymbol: string;
    putDisplaySymbol: string;
  }[];
  spc: number;
  // 仅 Weeklys 系列携带，如 "Weeklys"
  optionClassName?: string;
  name: string;
  contract: string;
  contractDisplay: string;
  daysToExpiration: number;
  settlementType: "AM" | "PM";
};

// 请求线格式：{underlyingSymbol, filter: {strikeQuantity, seriesNames?}}
export type OptionChainDetailsRequest = {
  symbol: string;
  seriesNames?: string[];
};

export default class OptionChainDetailsMessageHandler implements WebSocketApiMessageHandler<OptionChainDetailsRequest> {
  // param `seriesNames` as returned from `newOptionChainRequest`, eg: "16 JUN 23 100"
  buildRequest({
    symbol,
    seriesNames,
  }: OptionChainDetailsRequest): RawPayloadRequest {
    const filter: Record<string, any> = { strikeQuantity: 2147483647 };
    if (seriesNames !== undefined) filter.seriesNames = seriesNames;
    return {
      payload: [
        {
          header: {
            service: "option_chain/get",
            id: "option_chain/get",
            ver: 0,
          },
          params: {
            underlyingSymbol: symbol,
            filter,
          },
        },
      ],
    };
  }

  service: ApiService = "option_chain/get";
}
