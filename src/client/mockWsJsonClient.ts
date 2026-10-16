import { AccessTokenGetRequestParams } from "./services/accessTokenGetMessageHandler.js";
import { AuthCodeGetRequestParams } from "./services/authCodeGetMessageHandler.js";
import { CancelOrderResponse } from "./services/cancelOrderMessageHandler.js";
import {
  ChatCloseRequestParams,
  ChatCreateRequestParams,
  ChatSendMessageRequestParams,
  SupportChatMessagesRequestParams,
} from "./services/supportChatMessageHandlers.js";
import { ChartRequestParams } from "./services/chartMessageHandler.js";
import { CreateAlertRequestParams } from "./services/createAlertMessageHandler.js";
import {
  DemoAccountAdjustCashRequestParams,
  DemoAccountSetBalanceRequestParams,
} from "./services/demoAccountMessageHandlers.js";
import {
  DrawingCreateRequestParams,
  DrawingDeleteRequestParams,
  DrawingSetCreateRequestParams,
  DrawingSetDeleteRequestParams,
  DrawingUpdateRequestParams,
} from "./services/drawingMessageHandlers.js";
import {
  DrawingsRequestParams,
  DrawingSetsRequestParams,
} from "./services/drawingSetsMessageHandlers.js";
import { FundamentalsHistoryRequestParams } from "./services/fundamentalsHistoryMessageHandler.js";
import { LogoffSchwabRequestParams } from "./services/logoffSchwabMessageHandler.js";
import { RawLoginResponseBody } from "./services/loginMessageHandler.js";
import { MarketHoursRequestParams } from "./services/marketHoursMessageHandler.js";
import {
  NewsBodyRequestParams,
  NewsHeadersSubscribeRelevantRequestParams,
} from "./services/newsBodyMessageHandlers.js";
import { NewsHeadersGetRelevantRequestParams } from "./services/newsHeadersGetRelevantMessageHandler.js";
import { NewsHeadersSubscribeRequestParams } from "./services/newsHeadersSubscribeMessageHandler.js";
import { OptionChainDetailsRequest } from "./services/optionChainDetailsMessageHandler.js";
import { OptionQuotesRequestParams } from "./services/optionQuotesMessageHandler.js";
import {
  NormalizedOrderEvent,
  OrderEventsRequestParams,
  OrderEventsSnapshotResponse,
  RawOrderEvent,
  normalizeOrderEvent,
} from "./services/orderEventsMessageHandler.js";
import { PlaceLimitOrderRequestParams } from "./services/placeOrderMessageHandler.js";
import { QuotesGetRequestParams } from "./services/quotesGetMessageHandler.js";
import { ScanFilterGetRequestParams } from "./services/scanFilterGetMessageHandler.js";
import { ScanFilterParametersRequestParams } from "./services/scanFilterParametersMessageHandler.js";
import { ScanQueryGetRequestParams } from "./services/scanQueryGetMessageHandler.js";
import { ScanQuerySaveRequestParams } from "./services/scanQuerySaveMessageHandler.js";
import { StudySubscribeRequestParams } from "./services/studySubscribeMessageHandler.js";
import { ReplaceOrderRequestParams } from "./services/submitOrderMessageHandler.js";
import { TaxLotUpdateRequestParams } from "./services/taxLotUpdateMessageHandler.js";
import { UnsubscribeRequestParams } from "./services/unsubscribeMessageHandler.js";
import { WatchlistCategoriesRequestParams } from "./services/watchlistCategoriesMessageHandler.js";
import { WatchlistCreateRequestParams } from "./services/watchlistCreateMessageHandler.js";
import { WatchlistRenameRequestParams } from "./services/watchlistRenameMessageHandler.js";
// ---- 补充服务参数类型----
import { DisclosuresAcceptRequestParams } from "./services/disclosuresAcceptMessageHandler.js";
import { FundamentalsCurrentRequestParams } from "./services/fundamentalsCurrentMessageHandler.js";
import { NewsHeadersGetRequestParams } from "./services/newsHeadersGetMessageHandler.js";
import { OptionsStatisticsRequestParams } from "./services/optionsStatisticsMessageHandler.js";
import { OrderHistoryRequestParams } from "./services/orderHistoryMessageHandler.js";
import { StudiesGetRequestParams } from "./services/studiesGetMessageHandler.js";
import { TaxLotGetRequestParams } from "./services/taxLotGetMessageHandler.js";
import { TransactionsCategoriesRequestParams } from "./services/transactionsCategoriesMessageHandler.js";
import { UserPropertiesSetRequestParams } from "./services/userPropertiesSetMessageHandler.js";
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
    // mock 无真实 socket：空实现
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

  async *orderEvents(
    _: OrderEventsRequestParams,
  ): AsyncIterable<ParsedPayloadResponse> {
    const fixture: OrderEventsSnapshotResponse = {
      service: "order_events",
      orders: [],
    };
    return yield {
      body: fixture,
      service: "order_events",
    };
  }

  async *observeOrders(account: string): AsyncIterable<NormalizedOrderEvent> {
    for await (const response of this.orderEvents({ account })) {
      const orders = (response.body as { orders?: RawOrderEvent[] })?.orders;
      if (!orders) continue;
      for (const raw of orders) {
        yield normalizeOrderEvent(raw);
      }
    }
  }

  async *subscribeAlerts(
    _alertTypes?: string[],
  ): AsyncIterable<ParsedPayloadResponse> {
    return yield {
      body: {},
      service: "alerts/subscribe",
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

  addToWatchlist(
    watchlistId: number,
    symbols: string[],
  ): Promise<ParsedPayloadResponse> {
    // 服务端响应为合并后的完整 watchlist
    return Promise.resolve({
      service: "watchlist/add",
      body: {
        watchlist: {
          id: watchlistId,
          name: "foo",
          type: "STATIC",
          symbols,
        },
      },
    });
  }

  removeFromWatchlist(
    watchlistId: number,
    symbols: string[],
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "watchlist/remove",
      body: {
        watchlist: {
          id: watchlistId,
          name: "foo",
          type: "STATIC",
          symbols,
        },
      },
    });
  }

  rearrangeWatchlist(
    _watchlistId: number,
    _symbols: string[],
  ): Promise<ParsedPayloadResponse> {
    // 线上：新顺序生效走 watchlist/get 验证，rearrange 响应为空对象
    return Promise.resolve({
      service: "watchlist/rearrange",
      body: {},
    });
  }

  // ---- 扩展服务 fixture（与真实响应骨架一致，字段取保守空值）----

  getStudyCategories(): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "study/categories",
      body: { categories: [{ name: "Trend", studies: ["SimpleMovingAvg"] }] },
    });
  }

  async *subscribeStudies(
    _: StudySubscribeRequestParams,
  ): AsyncIterable<ParsedPayloadResponse> {
    return yield { service: "study/subscribe", body: {} };
  }

  getScanFilters(
    _: ScanFilterGetRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "scan_filter/get",
      body: { scanFilters: { STOCK: { filters: ["Price"] } } },
    });
  }

  getScanFilterParameters(
    _: ScanFilterParametersRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({ service: "scan_filter/parameters", body: {} });
  }

  getScanQuery(_: ScanQueryGetRequestParams): Promise<ParsedPayloadResponse> {
    return Promise.resolve({ service: "scan_query/get", body: {} });
  }

  saveScanQuery(_: ScanQuerySaveRequestParams): Promise<ParsedPayloadResponse> {
    return Promise.resolve({ service: "scan_query/save", body: {} });
  }

  getQuotes(request: QuotesGetRequestParams): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "quotes/get",
      body: {
        items: request.symbols.map((symbol) => ({
          symbol,
          isDelayed: true,
          values: {},
        })),
      },
    });
  }

  getFundamentalsHistory(
    _: FundamentalsHistoryRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({ service: "fundamentals/history", body: {} });
  }

  getAccessToken(
    request: AccessTokenGetRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "access_token/get",
      body: {
        accessExpiresIn: 300,
        accessToken: "mock-access-token",
        refreshToken: request.refreshToken,
      },
    });
  }

  getAuthCode(_: AuthCodeGetRequestParams): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "auth_code/get",
      body: { code: "mock" },
    });
  }

  getAnalystReportsToken(): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "analyst_reports/token",
      body: {
        uuid: "mock-uuid",
        accessToken: "mock-analyst-token",
        grantType: "Bearer",
        refreshIntervalMillis: 3_600_000,
      },
    });
  }

  createDrawing(
    request: DrawingCreateRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "drawing/create",
      body: { drawing: { ...request.drawing, guid: "mock-drawing-guid" } },
    });
  }

  updateDrawing(
    request: DrawingUpdateRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "drawing/update",
      body: { drawing: { ...request.drawing, guid: request.drawingGuid } },
    });
  }

  deleteDrawing(_: DrawingDeleteRequestParams): Promise<ParsedPayloadResponse> {
    return Promise.resolve({ service: "drawing/delete", body: {} });
  }

  createDrawingSet(
    request: DrawingSetCreateRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "drawing_set/create",
      body: {
        drawingSet: { guid: "mock-set-guid", name: request.name },
      },
    });
  }

  deleteDrawingSet(
    _: DrawingSetDeleteRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({ service: "drawing_set/delete", body: {} });
  }

  getDrawingSets(_: DrawingSetsRequestParams): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "drawing_sets",
      body: {
        drawingSets: [
          { guid: "mock-set-guid", name: "Default", isDefault: true },
        ],
      },
    });
  }

  getDrawings(_: DrawingsRequestParams): Promise<ParsedPayloadResponse> {
    return Promise.resolve({ service: "drawings", body: { drawings: [] } });
  }

  getRelevantNews(
    _: NewsHeadersGetRelevantRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "news_headers/get_relevant",
      body: { news: [] },
    });
  }

  async *subscribeNews(
    _: NewsHeadersSubscribeRequestParams,
  ): AsyncIterable<ParsedPayloadResponse> {
    return yield { service: "news_headers/subscribe", body: { news: [] } };
  }

  async *subscribeRelevantNews(
    _: NewsHeadersSubscribeRelevantRequestParams,
  ): AsyncIterable<ParsedPayloadResponse> {
    return yield {
      service: "news_headers/subscribe_relevant",
      body: { news: [] },
    };
  }

  newsBody(request: NewsBodyRequestParams): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "news_body",
      body: { newsCode: request.newsCode, text: "" },
    });
  }

  createChat(request: ChatCreateRequestParams): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "chat/create",
      body: {
        succeeded: true,
        chatRoom: { chatId: 1, name: request.newChatName },
      },
    });
  }

  closeChat(_: ChatCloseRequestParams): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "chat/close",
      body: { succeeded: true },
    });
  }

  sendChatMessage(
    _: ChatSendMessageRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "chat/send_message",
      body: { succeeded: true, messageId: 1 },
    });
  }

  getSupportChatMessages(
    request: SupportChatMessagesRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "support_chat/messages",
      body: { chatRoom: { chatId: request.chatId } },
    });
  }

  updateTaxLot(
    request: TaxLotUpdateRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "tax_lot/update",
      body: { refreshToken: request.refreshToken, orderStatuses: [] },
    });
  }

  unsubscribe(
    request: UnsubscribeRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "unsubscribe",
      body: {
        targetService: String(request.targetService),
        targetRequestId: request.targetRequestId,
      },
    });
  }

  /** 危险操作的 mock：仅回固定成功骨架，见 WsJsonClient 接口注释。 */
  demoAccountSetBalance(
    request: DemoAccountSetBalanceRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "demo_account/set_balance",
      body: { accountCode: request.accountCode },
    });
  }

  /** 危险操作的 mock：仅回固定成功骨架，见 WsJsonClient 接口注释。 */
  demoAccountAdjustCash(
    request: DemoAccountAdjustCashRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "demo_account/adjust_cash",
      body: { accountCode: request.accountCode },
    });
  }

  /** 危险操作的 mock：不会真的终止会话，见 WsJsonClient 接口注释。 */
  logoff(_: LogoffSchwabRequestParams): Promise<ParsedPayloadResponse> {
    return Promise.resolve({ service: "logoff/schwab", body: {} });
  }

  // ---- 补充服务 mock----

  getNews(_: NewsHeadersGetRequestParams): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "news_headers/get",
      body: {
        news: [
          {
            newsCode: "DOW_JONES:test",
            time: "2026-10-13T22:26:11Z",
            title: "Test headline",
            symbols: ["AAPL"],
            channel: "DOW_JONES",
          },
        ],
      },
    });
  }

  getFundamentals(
    request: FundamentalsCurrentRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "fundamentals/current",
      body: { symbol: request.symbol, values: { EARNINGS_PER_SHARE_TTM: 7.3 } },
    });
  }

  getStudies(_: StudiesGetRequestParams): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "studies/get",
      body: { studiesGetResponseJTOS: [{ name: "SimpleMovingAvg" }] },
    });
  }

  async *subscribeOptionsStatistics(
    request: OptionsStatisticsRequestParams,
  ): AsyncIterable<ParsedPayloadResponse> {
    yield {
      service: "options_statistics",
      body: {
        symbol: request.symbol,
        pcRatio: 0.8,
        totalVolume: { values: { calls: 10, puts: 8, total: 18 } },
        delta: {},
      },
    };
  }

  getOrderHistory(
    _request: OrderHistoryRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({
      service: "order_history",
      body: {
        orderHistoryEntries: [
          { orderId: 1, symbol: "AAPL", status: "CANCELED" },
        ],
      },
    });
  }

  getTaxLots(_: TaxLotGetRequestParams): Promise<ParsedPayloadResponse> {
    // 成功形状未验证（guest 权限拒绝），mock 给宽结构。
    return Promise.resolve({ service: "tax_lot/get", body: { lots: [] } });
  }

  getTransactionCategories(
    _request: TransactionsCategoriesRequestParams,
  ): Promise<ParsedPayloadResponse> {
    // 成功形状未验证（guest 校验错误），mock 给空对象。
    return Promise.resolve({ service: "transactions/categories", body: {} });
  }

  async *subscribeGlobalChats(): AsyncIterable<ParsedPayloadResponse> {
    yield {
      service: "chat_global/messages",
      body: {
        messages: { OPEN: "true" },
        hoursSchedule: "mo_07:00-mo_17:00",
        chatHours: {
          MONDAY: { open: true, fromTime: "07:00", toTime: "17:00" },
        },
      },
    };
  }

  getSupportChats(): Promise<ParsedPayloadResponse> {
    // 线上 guest 会话 body 为空对象。
    return Promise.resolve({ service: "support_chats", body: {} });
  }

  setUserProperties(
    _request: UserPropertiesSetRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({ service: "user_properties/set", body: {} });
  }

  acceptDisclosures(
    _request: DisclosuresAcceptRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return Promise.resolve({ service: "disclosures/accept", body: {} });
  }
}
