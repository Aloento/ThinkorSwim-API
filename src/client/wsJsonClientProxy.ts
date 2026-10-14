import debug from "debug";
import WebSocket from "isomorphic-ws";
import {
  BufferedIterator,
  deferredWrap,
  MulticastIterator,
  Observable,
} from "obgen";
import { ChannelState } from "./realWsJsonClient.js";
import { AccessTokenGetRequestParams } from "./services/accessTokenGetMessageHandler.js";
import { AuthCodeGetRequestParams } from "./services/authCodeGetMessageHandler.js";
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
// ---- 第五批参数类型（task-13，agent/07 §第五批接入契约）----
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

const logger = debug("wsClientProxy");

export const ALL_REQUESTS = [
  "authenticateWithAuthCode",
  "authenticateWithAccessToken",
  // A6（agent/03）：optionChainQuotes 曾在 68/78 行重复出现两次，去重
  "disconnect",
  "reconnect",
  "quotes",
  "accountPositions",
  "getPositions",
  "chart",
  "searchInstruments",
  "lookupAlerts",
  "optionChain",
  "optionChainQuotes",
  "optionChainDetails",
  "optionQuotes",
  "placeOrder",
  "confirmOrder",
  "submitOrder",
  "replaceOrder",
  "workingOrders",
  "createAlert",
  "cancelAlert",
  "cancelOrder",
  "userProperties",
  "marketDepth",
  "watchlist",
  "getAccounts",
  "getStatement",
  "getMarginCalls",
  "getMarketHours",
  "getDisclosures",
  "getMessageCenter",
  "subscribeMessageCenter",
  "getWatchlists",
  "createWatchlist",
  "renameWatchlist",
  "deleteWatchlist",
  "addToWatchlist",
  "removeFromWatchlist",
  "rearrangeWatchlist",
  // ---- 第四批（task-9）：全部单对象参数，wire 上 args 即参数本体，
  // 无需 relaySpread（lead 建议：新门面方法尽量单对象参数）----
  "getStudyCategories",
  "subscribeStudies",
  "getScanFilters",
  "getScanFilterParameters",
  "getScanQuery",
  "saveScanQuery",
  "getQuotes",
  "getFundamentalsHistory",
  "getAccessToken",
  "getAuthCode",
  "getAnalystReportsToken",
  "createDrawing",
  "updateDrawing",
  "deleteDrawing",
  "createDrawingSet",
  "deleteDrawingSet",
  "getDrawingSets",
  "getDrawings",
  "getRelevantNews",
  "subscribeNews",
  "subscribeRelevantNews",
  "newsBody",
  "createChat",
  "closeChat",
  "sendChatMessage",
  "getSupportChatMessages",
  "updateTaxLot",
  "unsubscribe",
  "demoAccountSetBalance",
  "demoAccountAdjustCash",
  "logoff",
  // ---- 第五批（task-13）：全部单对象参数或零参，wire 上 args 即参数本体----
  "getNews",
  "getFundamentals",
  "getStudies",
  "subscribeOptionsStatistics",
  "getOrderHistory",
  "getTaxLots",
  "getTransactionCategories",
  "subscribeGlobalChats",
  "getSupportChats",
  "setUserProperties",
  "acceptDisclosures",
  // ---- 第六批（task-14）----
  "subscribeAlerts",
  "orderEvents",
  "observeOrders",
] as const;
type RequestType = typeof ALL_REQUESTS;
export type Request = RequestType[number];

export type ProxiedRequest = {
  request: Request;
  args?: any;
  /** S1（task-15）：服务端配了 authToken 时随每条消息附带 */
  token?: string;
};

export type ProxiedResponse = ProxiedRequest & { response: unknown };

export type WsJsonClientProxyOptions = {
  /**
   * S1（task-15）：共享 token。设置后随每条消息附带顶层 token 字段，
   * 与服务端 WsJsonServerProxyOptions.authToken 一致才能通过校验。
   */
  authToken?: string;
};

// A WsJsonClient proxy implementation that proxies requests to a WebSocket server using the provided `proxyUrl`.
export class WsJsonClientProxy implements WsJsonClient {
  private state = ChannelState.DISCONNECTED;
  private buffer = new BufferedIterator<ProxiedResponse>();
  private iterator = new MulticastIterator(this.buffer);
  private socket?: WebSocket;

  constructor(
    private readonly proxyUrl: string,
    private readonly options?: any,
    private readonly proxyOptions?: WsJsonClientProxyOptions,
  ) {}

  authenticateWithAuthCode(
    authCode: string,
  ): Promise<RawLoginResponseBody | null> {
    return this.authenticate("authenticateWithAuthCode", authCode);
  }

  authenticateWithAccessToken(args: {
    accessToken: string;
    refreshToken?: string;
  }): Promise<RawLoginResponseBody | null> {
    return this.authenticate("authenticateWithAccessToken", args);
  }

  private authenticate(
    method: "authenticateWithAuthCode" | "authenticateWithAccessToken",
    args: string | { accessToken: string; refreshToken?: string },
  ): Promise<RawLoginResponseBody | null> {
    this.socket = new WebSocket(this.proxyUrl, this.options);
    this.state = ChannelState.CONNECTING;
    this.buffer = new BufferedIterator<ProxiedResponse>();
    this.iterator = new MulticastIterator(this.buffer);
    const { buffer, socket } = this;
    return new Promise((resolve, reject) => {
      socket.onmessage = ({ data }) => {
        // make sure date objects are reconstructed across the wire
        const parsedMsg = JSON.parse(data as string, dateReviver);
        buffer.emit(parsedMsg as ProxiedResponse);
      };
      socket.onopen = () => {
        logger("proxy ws connection opened");
        this.state = ChannelState.CONNECTED;
        this.doAuthenticate(method, args).then((raw) => {
          logger("proxy ws authentication response: %O", raw);
          const res = raw as RawLoginResponseBody | string | null;
          if (typeof res === "string" && res.includes("NOT_AUTHORIZED")) {
            reject(res);
          } else {
            resolve(res as RawLoginResponseBody | null);
          }
        });
      };
      socket.onclose = (event) => {
        this.state = ChannelState.DISCONNECTED;
        logger("proxy ws connection closed: ", event?.reason);
        reject(event?.reason);
      };
      socket.onerror = (err) => {
        this.state = ChannelState.ERROR;
        logger("proxy ws socket error: %O", err);
        reject(err);
      };
    });
  }

  private doAuthenticate(
    method: "authenticateWithAuthCode" | "authenticateWithAccessToken",
    args: string | { accessToken: string; refreshToken?: string },
  ): Promise<RawLoginResponseBody | null> {
    return this.dispatch<RawLoginResponseBody | null>(method, args).promise();
  }

  accountPositions(
    accountNumber: string,
  ): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "accountPositions",
      accountNumber,
    ).iterable();
  }

  getPositions(accountNumber: string): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "getPositions",
      accountNumber,
    ).iterable();
  }

  cancelAlert(alertId: number): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "cancelAlert",
      alertId,
    ).promise();
  }

  cancelOrder(orderId: number): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "cancelOrder",
      orderId,
    ).promise();
  }

  chart(request: ChartRequestParams): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>("chart", request).iterable();
  }

  createAlert(
    request: CreateAlertRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "createAlert",
      request,
    ).promise();
  }

  disconnect(): void {
    this.sendMessage({ request: "disconnect" });
  }

  /** 透传到上游真实客户端的重连（握手→登录→订阅重放完成后 resolve） */
  reconnect(): Promise<void> {
    return this.dispatch<void>("reconnect").promise();
  }

  ensureConnected(): void {
    if (this.state !== ChannelState.CONNECTED) {
      throw new Error("Not connected");
    }
  }

  isConnected(): boolean {
    return this.state === ChannelState.CONNECTED;
  }

  isConnecting(): boolean {
    return this.state === ChannelState.CONNECTING;
  }

  lookupAlerts(): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>("lookupAlerts").iterable();
  }

  marketDepth(symbol: string): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "marketDepth",
      symbol,
    ).iterable();
  }

  optionChain(symbol: string): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "optionChain",
      symbol,
    ).promise();
  }

  optionChainDetails(
    request: OptionChainDetailsRequest,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "optionChainDetails",
      request,
    ).promise();
  }

  optionChainQuotes(symbol: string): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "optionChainQuotes",
      symbol,
    ).iterable();
  }

  optionQuotes(
    request: OptionQuotesRequestParams,
  ): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "optionQuotes",
      request,
    ).iterable();
  }

  placeOrder(
    request: PlaceLimitOrderRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "placeOrder",
      request,
    ).promise();
  }

  confirmOrder(
    draft: PlaceLimitOrderRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "confirmOrder",
      draft,
    ).promise();
  }

  submitOrder(
    draft: PlaceLimitOrderRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>("submitOrder", draft).promise();
  }

  replaceOrder(
    request: ReplaceOrderRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "replaceOrder",
      request,
    ).promise();
  }

  quotes(symbols: string[]): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>("quotes", symbols).iterable();
  }

  searchInstruments(query: string): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "searchInstruments",
      query,
    ).promise();
  }

  userProperties(): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>("userProperties").promise();
  }

  watchlist(watchlistId: number): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "watchlist",
      watchlistId,
    ).promise();
  }

  getAccounts(): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>("getAccounts").promise();
  }

  getStatement(account: string): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "getStatement",
      account,
    ).promise();
  }

  getMarginCalls(): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>("getMarginCalls").promise();
  }

  getMarketHours(
    request: MarketHoursRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "getMarketHours",
      request,
    ).promise();
  }

  getDisclosures(): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>("getDisclosures").promise();
  }

  getMessageCenter(): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>("getMessageCenter").promise();
  }

  subscribeMessageCenter(): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "subscribeMessageCenter",
    ).iterable();
  }

  getWatchlists(
    request: WatchlistCategoriesRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "getWatchlists",
      request,
    ).promise();
  }

  createWatchlist(
    request: WatchlistCreateRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "createWatchlist",
      request,
    ).promise();
  }

  renameWatchlist(
    request: WatchlistRenameRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "renameWatchlist",
      request,
    ).promise();
  }

  deleteWatchlist(watchlistId: number): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "deleteWatchlist",
      watchlistId,
    ).promise();
  }

  // 双位置参数的方法在 wire 上以 {watchlistId, symbols} 对象传输，
  // 服务端（WsJsonServerProxy）解包回两个实参。
  addToWatchlist(
    watchlistId: number,
    symbols: string[],
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>("addToWatchlist", {
      watchlistId,
      symbols,
    }).promise();
  }

  removeFromWatchlist(
    watchlistId: number,
    symbols: string[],
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>("removeFromWatchlist", {
      watchlistId,
      symbols,
    }).promise();
  }

  rearrangeWatchlist(
    watchlistId: number,
    symbols: string[],
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>("rearrangeWatchlist", {
      watchlistId,
      symbols,
    }).promise();
  }

  // ---- 第四批透传（task-9）：全部单对象参数（或零参），直接 dispatch ----

  getStudyCategories(): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>("getStudyCategories").promise();
  }

  subscribeStudies(
    request: StudySubscribeRequestParams,
  ): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "subscribeStudies",
      request,
    ).iterable();
  }

  getScanFilters(
    request?: ScanFilterGetRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "getScanFilters",
      request,
    ).promise();
  }

  getScanFilterParameters(
    request: ScanFilterParametersRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "getScanFilterParameters",
      request,
    ).promise();
  }

  getScanQuery(
    request: ScanQueryGetRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "getScanQuery",
      request,
    ).promise();
  }

  saveScanQuery(
    request: ScanQuerySaveRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "saveScanQuery",
      request,
    ).promise();
  }

  getQuotes(request: QuotesGetRequestParams): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>("getQuotes", request).promise();
  }

  getFundamentalsHistory(
    request: FundamentalsHistoryRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "getFundamentalsHistory",
      request,
    ).promise();
  }

  getAccessToken(
    request: AccessTokenGetRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "getAccessToken",
      request,
    ).promise();
  }

  getAuthCode(
    request: AuthCodeGetRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "getAuthCode",
      request,
    ).promise();
  }

  getAnalystReportsToken(): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "getAnalystReportsToken",
    ).promise();
  }

  createDrawing(
    request: DrawingCreateRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "createDrawing",
      request,
    ).promise();
  }

  updateDrawing(
    request: DrawingUpdateRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "updateDrawing",
      request,
    ).promise();
  }

  deleteDrawing(
    request: DrawingDeleteRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "deleteDrawing",
      request,
    ).promise();
  }

  createDrawingSet(
    request: DrawingSetCreateRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "createDrawingSet",
      request,
    ).promise();
  }

  deleteDrawingSet(
    request: DrawingSetDeleteRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "deleteDrawingSet",
      request,
    ).promise();
  }

  getDrawingSets(
    request: DrawingSetsRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "getDrawingSets",
      request,
    ).promise();
  }

  getDrawings(request: DrawingsRequestParams): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "getDrawings",
      request,
    ).promise();
  }

  getRelevantNews(
    request: NewsHeadersGetRelevantRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "getRelevantNews",
      request,
    ).promise();
  }

  subscribeNews(
    request: NewsHeadersSubscribeRequestParams,
  ): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "subscribeNews",
      request,
    ).iterable();
  }

  subscribeRelevantNews(
    request: NewsHeadersSubscribeRelevantRequestParams,
  ): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "subscribeRelevantNews",
      request,
    ).iterable();
  }

  newsBody(request: NewsBodyRequestParams): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>("newsBody", request).promise();
  }

  createChat(request: ChatCreateRequestParams): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "createChat",
      request,
    ).promise();
  }

  closeChat(request: ChatCloseRequestParams): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>("closeChat", request).promise();
  }

  sendChatMessage(
    request: ChatSendMessageRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "sendChatMessage",
      request,
    ).promise();
  }

  getSupportChatMessages(
    request: SupportChatMessagesRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "getSupportChatMessages",
      request,
    ).promise();
  }

  updateTaxLot(
    request: TaxLotUpdateRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "updateTaxLot",
      request,
    ).promise();
  }

  unsubscribe(
    request: UnsubscribeRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "unsubscribe",
      request,
    ).promise();
  }

  /** ⚠️ 危险操作透传，见 WsJsonClient 接口注释。 */
  demoAccountSetBalance(
    request: DemoAccountSetBalanceRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "demoAccountSetBalance",
      request,
    ).promise();
  }

  /** ⚠️ 危险操作透传，见 WsJsonClient 接口注释。 */
  demoAccountAdjustCash(
    request: DemoAccountAdjustCashRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "demoAccountAdjustCash",
      request,
    ).promise();
  }

  /** ⚠️ 危险操作透传，见 WsJsonClient 接口注释。 */
  logoff(request: LogoffSchwabRequestParams): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>("logoff", request).promise();
  }

  // ---- 第五批透传（task-13）：全部单对象参数或零参，直接 dispatch ----

  getNews(
    request: NewsHeadersGetRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>("getNews", request).promise();
  }

  getFundamentals(
    request: FundamentalsCurrentRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "getFundamentals",
      request,
    ).promise();
  }

  getStudies(request: StudiesGetRequestParams): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "getStudies",
      request,
    ).promise();
  }

  subscribeOptionsStatistics(
    request: OptionsStatisticsRequestParams,
  ): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "subscribeOptionsStatistics",
      request,
    ).iterable();
  }

  getOrderHistory(
    request: OrderHistoryRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "getOrderHistory",
      request,
    ).promise();
  }

  getTaxLots(request: TaxLotGetRequestParams): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "getTaxLots",
      request,
    ).promise();
  }

  getTransactionCategories(
    request: TransactionsCategoriesRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "getTransactionCategories",
      request,
    ).promise();
  }

  subscribeGlobalChats(): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "subscribeGlobalChats",
    ).iterable();
  }

  getSupportChats(): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>("getSupportChats").promise();
  }

  /** ⚠️ 写操作透传，见 WsJsonClient 接口注释。 */
  setUserProperties(
    request: UserPropertiesSetRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "setUserProperties",
      request,
    ).promise();
  }

  /** ⚠️ 写操作透传，见 WsJsonClient 接口注释。 */
  acceptDisclosures(
    request: DisclosuresAcceptRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "acceptDisclosures",
      request,
    ).promise();
  }

  workingOrders(accountNumber: string): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "workingOrders",
      accountNumber,
    ).iterable();
  }

  /** task-14B：alerts/subscribe 流（args 为 alertTypes 数组或 undefined） */
  subscribeAlerts(alertTypes?: string[]): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "subscribeAlerts",
      alertTypes,
    ).iterable();
  }

  /** task-14A：order_events 原始流（args 单对象 {account, types?}） */
  orderEvents(
    request: OrderEventsRequestParams,
  ): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatch<ParsedPayloadResponse>(
      "orderEvents",
      request,
    ).iterable();
  }

  /** task-14A：归一化事件流。载荷为纯 JSON（无 Date），跨 wire 无需 dateReviver */
  observeOrders(account: string): AsyncIterable<NormalizedOrderEvent> {
    return this.dispatch<NormalizedOrderEvent>(
      "observeOrders",
      account,
    ).iterable();
  }

  private sendMessage(request: ProxiedRequest) {
    this.ensureConnected();
    // S1（task-15）：配了 authToken 就随每条消息附带（含 disconnect）。
    const message =
      this.proxyOptions?.authToken !== undefined
        ? { ...request, token: this.proxyOptions.authToken }
        : request;
    this.socket!.send(JSON.stringify(message));
  }

  private dispatch<T>(req: Request, args?: any): Observable<T> {
    this.sendMessage({ request: req, args });
    return deferredWrap<ProxiedResponse>(() => this.iterator)
      .filter(({ request }) => request === req)
      .map(({ response }) => response as T);
  }
}

function dateReviver(_: string, value: any): any {
  if (typeof value === "string") {
    // Regular expression to check if the string matches ISO 8601 date format
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
    if (isoDateRegex.test(value)) {
      return new Date(value);
    }
  }
  return value; // return the value unchanged if not a date string
}
