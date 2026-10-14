import { CancelOrderResponse } from "./services/cancelOrderMessageHandler.js";
import { ChartRequestParams } from "./services/chartMessageHandler.js";
import { CreateAlertRequestParams } from "./services/createAlertMessageHandler.js";
import { RawLoginResponseBody } from "./services/loginMessageHandler.js";
import { MarketHoursRequestParams } from "./services/marketHoursMessageHandler.js";
import { OptionChainDetailsRequest } from "./services/optionChainDetailsMessageHandler.js";
import { OptionQuotesRequestParams } from "./services/optionQuotesMessageHandler.js";
import { PlaceLimitOrderRequestParams } from "./services/placeOrderMessageHandler.js";
import { ReplaceOrderRequestParams } from "./services/submitOrderMessageHandler.js";
import { WatchlistCategoriesRequestParams } from "./services/watchlistCategoriesMessageHandler.js";
import { WatchlistCreateRequestParams } from "./services/watchlistCreateMessageHandler.js";
import { WatchlistRenameRequestParams } from "./services/watchlistRenameMessageHandler.js";
import { ParsedPayloadResponse } from "./tdaWsJsonTypes.js";
import { WsJsonClient } from "./wsJsonClient.js";

export default class MockWsJsonClient implements WsJsonClient {
  authenticateWithAuthCode(
    _authCode: string,
  ): Promise<RawLoginResponseBody | null> {
    throw new Error("Method not implemented.");
  }

  authenticateWithAccessToken(_: {
    accessToken: string;
    refreshToken?: string;
  }): Promise<RawLoginResponseBody | null> {
    throw new Error("Method not implemented.");
  }

  async *accountPositions(_: string): AsyncIterable<ParsedPayloadResponse> {
    return yield {
      service: "positions",
      body: { positions: [] },
    };
  }

  getPositions(accountNumber: string): AsyncIterable<ParsedPayloadResponse> {
    return this.accountPositions(accountNumber);
  }

  cancelAlert(_: number): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "alerts/cancel",
      body: { alerts: [] },
    });
  }

  cancelOrder(_: number): Promise<CancelOrderResponse> {
    return Promise.resolve({
      service: "cancel_order",
      orderId: 123,
      type: "snapshot",
      body: {},
    });
  }

  async *chart(_: ChartRequestParams): AsyncIterable<ParsedPayloadResponse> {
    return yield {
      service: "chart",
      body: { symbol: "", candles: [] },
    };
  }

  createAlert(_: CreateAlertRequestParams): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "alerts/create",
      body: { alerts: [] },
    });
  }

  disconnect(): void {}

  reconnect(): Promise<void> {
    // Mock 连接无真实 socket：空实现
    return Promise.resolve();
  }

  ensureConnected(): void {}

  isConnected(): boolean {
    return true;
  }

  isConnecting(): boolean {
    return false;
  }

  async *lookupAlerts(): AsyncIterable<ParsedPayloadResponse> {
    return yield {
      service: "alerts/lookup",
      body: {},
    };
  }

  optionChain(_: string): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "optionSeries",
      body: {},
    });
  }

  optionChainDetails(
    _: OptionChainDetailsRequest,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "option_chain/get",
      body: {},
    });
  }

  async *optionChainQuotes(_: string): AsyncIterable<ParsedPayloadResponse> {
    return yield {
      service: "optionSeries/quotes",
      body: {},
    };
  }

  async *optionQuotes(
    _: OptionQuotesRequestParams,
  ): AsyncIterable<ParsedPayloadResponse> {
    return yield {
      service: "quotes/options",
      body: {},
    };
  }

  placeOrder(_: PlaceLimitOrderRequestParams): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "place_order",
      body: {},
    });
  }

  confirmOrder(
    _: PlaceLimitOrderRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "place_order",
      body: { groupType: "SINGLE", maxOrders: 1, orders: [] },
    });
  }

  submitOrder(_: PlaceLimitOrderRequestParams): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "place_order",
      body: { orderId: 123 },
    });
  }

  async *quotes(_: string[]): AsyncIterable<ParsedPayloadResponse> {
    return yield {
      service: "quotes",
      body: {},
    };
  }

  replaceOrder(_: ReplaceOrderRequestParams): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "order_events",
      body: {},
    });
  }

  searchInstruments(_: string): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "instrument_search",
      body: {},
    });
  }

  userProperties(): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "user_properties",
      body: {
        defaultAccountCode: "foo",
        nickname: "foo",
        plDisplayMethod: "foo",
        stocksOrderDefaultType: "foo",
        stocksOrderDefaultQuantity: 0,
        stocksOrderQuantityIncrement: 0,
        optionsOrderDefaultType: "foo",
        optionsOrderDefaultQuantity: 0,
        optionsOrderQuantityIncrement: 0,
        futuresOrderOrderDefaultType: "foo",
        futuresOrderDefaultType: "foo",
        futuresOrderDefaultQuantity: 0,
        futuresOrderQuantityIncrement: 0,
        futureOptionsOrderDefaultType: "foo",
        futureOptionsOrderDefaultQuantity: 0,
        futureOptionsOrderQuantityIncrement: 0,
        forexOrderDefaultType: "foo",
        forexOrderDefaultQuantity: 0,
        forexOrderQuantityIncrement: 0,
      },
    });
  }

  async *workingOrders(_: string): AsyncIterable<ParsedPayloadResponse> {
    return yield {
      body: {},
      service: "order_events",
    };
  }

  async *marketDepth(_: string): AsyncIterable<ParsedPayloadResponse> {
    return yield {
      body: {
        bidQuotes: [],
        askQuotes: [],
      },
      service: "market_depth",
    };
  }

  watchlist(watchlistId: number): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "watchlist/get",
      body: {
        watchlist: {
          id: watchlistId,
          name: "foo",
          type: "STATIC",
          symbols: ["AAPL", "GOOG", "MSFT"],
        },
      },
    });
  }

  getAccounts(): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "accounts",
      body: { items: [] },
    });
  }

  getStatement(_: string): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "statement",
      body: {},
    });
  }

  getMarginCalls(): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "margin_calls",
      body: {},
    });
  }

  getMarketHours(_: MarketHoursRequestParams): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "market_hours",
      body: { schwabMarketHours: {} },
    });
  }

  getDisclosures(): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "disclosures",
      body: {},
    });
  }

  getMessageCenter(): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "message_center/get",
      body: {},
    });
  }

  async *subscribeMessageCenter(): AsyncIterable<ParsedPayloadResponse> {
    return yield {
      service: "message_center/subscribe",
      body: {},
    };
  }

  getWatchlists(
    _: WatchlistCategoriesRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "watchlist/categories",
      body: { categories: [] },
    });
  }

  createWatchlist(
    request: WatchlistCreateRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "watchlist/create",
      body: {
        watchlist: {
          id: 1,
          name: request.watchlistName,
          type: "STATIC",
          symbols: request.symbols,
        },
      },
    });
  }

  renameWatchlist(
    request: WatchlistRenameRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "watchlist/rename",
      body: {
        watchlistId: request.watchlistId,
        watchlistName: request.watchlistName,
      },
    });
  }

  deleteWatchlist(_: number): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "watchlist/delete",
      body: {},
    });
  }
}
