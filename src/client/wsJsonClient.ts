import { Disposable } from "../server/disposable.js";
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
import {
  ReplaceOrderRequestParams,
  SubmitDraftOrderRequestParams,
} from "./services/submitOrderMessageHandler.js";
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

export interface WsJsonClient extends Disposable {
  authenticateWithAuthCode(
    authCode: string,
  ): Promise<RawLoginResponseBody | null>;

  authenticateWithAccessToken(args: {
    accessToken: string;
    /** refreshToken 可选：guest 路径没有 refresh token */
    refreshToken?: string;
  }): Promise<RawLoginResponseBody | null>;

  isConnected(): boolean;

  isConnecting(): boolean;

  ensureConnected(): void;

  /**
   * 以全新 WebSocket 连接重走握手→登录→流式订阅重放。成功登录后 resolve。
   * 一次性（promise 型）请求不会自动重发——断开时它们已 reject。
   */
  reconnect(): Promise<void>;

  quotes(symbols: string[]): AsyncIterable<ParsedPayloadResponse>;

  accountPositions(accountNumber: string): AsyncIterable<ParsedPayloadResponse>;

  /** accountPositions 的语义别名（门面统一 get* 命名） */
  getPositions(accountNumber: string): AsyncIterable<ParsedPayloadResponse>;

  chart(request: ChartRequestParams): AsyncIterable<ParsedPayloadResponse>;

  searchInstruments(query: string): Promise<ParsedPayloadResponse>;

  lookupAlerts(): AsyncIterable<ParsedPayloadResponse>;

  /**
   * alerts/subscribe：告警事件流。alertTypes 缺省
   * DEFAULT_ALERT_TYPES（CHANGED/TRIGGERED/EXPIRED/MULTIPLE_EXPIRED）。
   */
  subscribeAlerts(alertTypes?: string[]): AsyncIterable<ParsedPayloadResponse>;

  /** order_events 原始事件流：body.orders[] 为 wire 原样 */
  orderEvents(
    request: OrderEventsRequestParams,
  ): AsyncIterable<ParsedPayloadResponse>;

  /** 归一化订单事件流：orders[] 逐条展平 + status 归一 */
  observeOrders(account: string): AsyncIterable<NormalizedOrderEvent>;

  optionChain(symbol: string): Promise<ParsedPayloadResponse>;

  optionChainQuotes(symbol: string): AsyncIterable<ParsedPayloadResponse>;

  optionChainDetails(
    request: OptionChainDetailsRequest,
  ): Promise<ParsedPayloadResponse>;

  optionQuotes(
    request: OptionQuotesRequestParams,
  ): AsyncIterable<ParsedPayloadResponse>;

  placeOrder(
    request: PlaceLimitOrderRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /**
   * 下单第一步：place_order action=CONFIRM ver=1，
   * header.id = update-draft-order-<SYMBOL>。返回草稿 snapshot。
   */
  confirmOrder(
    draft: PlaceLimitOrderRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /**
   * 下单第二步：place_order action=SUBMIT ver=0，必须复用 confirmOrder 的
   * 草稿 id（update-draft-order-<SYMBOL>）——换 id 报
   * "Can not submit while prices are not available!"。
   * orderId 经 patch /orders/0/orderId 返回。
   */
  submitOrder(
    draft: SubmitDraftOrderRequestParams,
  ): Promise<ParsedPayloadResponse>;

  replaceOrder(
    request: ReplaceOrderRequestParams,
  ): Promise<ParsedPayloadResponse>;

  workingOrders(accountNumber: string): AsyncIterable<ParsedPayloadResponse>;

  createAlert(
    request: CreateAlertRequestParams,
  ): Promise<ParsedPayloadResponse>;

  cancelAlert(alertId: number): Promise<ParsedPayloadResponse>;

  cancelOrder(orderId: number): Promise<ParsedPayloadResponse>;

  userProperties(): Promise<ParsedPayloadResponse>;

  marketDepth(symbol: string): AsyncIterable<ParsedPayloadResponse>;

  watchlist(watchlistId: number): Promise<ParsedPayloadResponse>;

  // ---- 账户域 ----

  getAccounts(): Promise<ParsedPayloadResponse>;

  /**
   * statement：服务端持久订阅，读完必须退订（见 RealWsJsonClient.dispatchOneShot
   * 的 releaseSubscription）。
   */
  getStatement(account: string): Promise<ParsedPayloadResponse>;

  getMarginCalls(): Promise<ParsedPayloadResponse>;

  /** market_hours：参数是 {markets, date}，不是 exchanges */
  getMarketHours(
    request: MarketHoursRequestParams,
  ): Promise<ParsedPayloadResponse>;

  getDisclosures(): Promise<ParsedPayloadResponse>;

  getMessageCenter(): Promise<ParsedPayloadResponse>;

  /** message_center/subscribe：零参数，持续推送 */
  subscribeMessageCenter(): AsyncIterable<ParsedPayloadResponse>;

  // ---- 自选列表 ----

  getWatchlists(
    request: WatchlistCategoriesRequestParams,
  ): Promise<ParsedPayloadResponse>;

  createWatchlist(
    request: WatchlistCreateRequestParams,
  ): Promise<ParsedPayloadResponse>;

  renameWatchlist(
    request: WatchlistRenameRequestParams,
  ): Promise<ParsedPayloadResponse>;

  deleteWatchlist(watchlistId: number): Promise<ParsedPayloadResponse>;

  /** watchlist/add：响应为合并后的完整 watchlist */
  addToWatchlist(
    watchlistId: number,
    symbols: string[],
  ): Promise<ParsedPayloadResponse>;

  /** watchlist/remove：响应为删除成分后的完整 watchlist */
  removeFromWatchlist(
    watchlistId: number,
    symbols: string[],
  ): Promise<ParsedPayloadResponse>;

  /** watchlist/rearrange：symbols 为新顺序，响应为空对象 */
  rearrangeWatchlist(
    watchlistId: number,
    symbols: string[],
  ): Promise<ParsedPayloadResponse>;

  // ---- 扩展服务----
  // 一次性 Promise 型走 dispatchOneShot：断线 reject，不重放。

  /** study/categories：研究指标目录 */
  getStudyCategories(): Promise<ParsedPayloadResponse>;

  /** study/subscribe：指标数值推送流（guest 权限受限） */
  subscribeStudies(
    request: StudySubscribeRequestParams,
  ): AsyncIterable<ParsedPayloadResponse>;

  /** scan_filter/get：screener 筛选器目录 */
  getScanFilters(
    request?: ScanFilterGetRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /** scan_filter/parameters：筛选器参数定义（guest 空响应） */
  getScanFilterParameters(
    request: ScanFilterParametersRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /** scan_query/get：screener 查询（guest 受限） */
  getScanQuery(
    request: ScanQueryGetRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /** scan_query/save：保存 screener 查询 */
  saveScanQuery(
    request: ScanQuerySaveRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /** quotes/get：一次性报价快照，服务端订阅自灭，可重复调用 */
  getQuotes(request: QuotesGetRequestParams): Promise<ParsedPayloadResponse>;

  /** fundamentals/history：历史基本面序列（guest 校验不通过） */
  getFundamentalsHistory(
    request: FundamentalsHistoryRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /** access_token/get：refreshToken 换 accessToken（token 续期，wsjson 通道） */
  getAccessToken(
    request: AccessTokenGetRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /** auth_code/get：refreshToken 换一次性 auth code */
  getAuthCode(
    request: AuthCodeGetRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /** analyst_reports/token：分析师报告第三方访问 token */
  getAnalystReportsToken(): Promise<ParsedPayloadResponse>;

  createDrawing(
    request: DrawingCreateRequestParams,
  ): Promise<ParsedPayloadResponse>;

  updateDrawing(
    request: DrawingUpdateRequestParams,
  ): Promise<ParsedPayloadResponse>;

  deleteDrawing(
    request: DrawingDeleteRequestParams,
  ): Promise<ParsedPayloadResponse>;

  createDrawingSet(
    request: DrawingSetCreateRequestParams,
  ): Promise<ParsedPayloadResponse>;

  deleteDrawingSet(
    request: DrawingSetDeleteRequestParams,
  ): Promise<ParsedPayloadResponse>;

  getDrawingSets(
    request: DrawingSetsRequestParams,
  ): Promise<ParsedPayloadResponse>;

  getDrawings(request: DrawingsRequestParams): Promise<ParsedPayloadResponse>;

  /** news_headers/get_relevant：相关度新闻（guest 权限受限） */
  getRelevantNews(
    request: NewsHeadersGetRelevantRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /** news_headers/subscribe：新闻标题推送流 */
  subscribeNews(
    request: NewsHeadersSubscribeRequestParams,
  ): AsyncIterable<ParsedPayloadResponse>;

  /** news_headers/subscribe_relevant：相关度新闻推送流（guest 权限受限） */
  subscribeRelevantNews(
    request: NewsHeadersSubscribeRelevantRequestParams,
  ): AsyncIterable<ParsedPayloadResponse>;

  newsBody(request: NewsBodyRequestParams): Promise<ParsedPayloadResponse>;

  createChat(request: ChatCreateRequestParams): Promise<ParsedPayloadResponse>;

  closeChat(request: ChatCloseRequestParams): Promise<ParsedPayloadResponse>;

  sendChatMessage(
    request: ChatSendMessageRequestParams,
  ): Promise<ParsedPayloadResponse>;

  getSupportChatMessages(
    request: SupportChatMessagesRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /** tax_lot/update：税批选择更新（写操作） */
  updateTaxLot(
    request: TaxLotUpdateRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /** unsubscribe：取消服务端订阅（资源清理） */
  unsubscribe(
    request: UnsubscribeRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /**
   * demo_account/set_balance：重置模拟盘余额，破坏性资金操作，guest 未验证
   * 成功帧。只在自建 demo 账户上调用。
   * @deprecated 危险操作：仅在自建 demo 账户上显式使用。
   */
  demoAccountSetBalance(
    request: DemoAccountSetBalanceRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /**
   * demo_account/adjust_cash：模拟盘现金划转，破坏性资金操作。
   * 只在自建 demo 账户上调用。
   * @deprecated 危险操作：仅在自建 demo 账户上显式使用。
   */
  demoAccountAdjustCash(
    request: DemoAccountAdjustCashRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /**
   * logoff/schwab：终止服务端 Schwab 会话，调用后当前 accessToken 失效，
   * 需完整重认证。
   * @deprecated 危险操作：终结会话，仅显式登出时使用。
   */
  logoff(request: LogoffSchwabRequestParams): Promise<ParsedPayloadResponse>;

  // ---- 补充服务----

  /** news_headers/get：新闻标题 snapshot，参数 [symbol, limit?] */
  getNews(request: NewsHeadersGetRequestParams): Promise<ParsedPayloadResponse>;

  /** fundamentals/current：当前基本面（symbol/time/fields 均必传） */
  getFundamentals(
    request: FundamentalsCurrentRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /** studies/get：研究指标元数据（studies 非空真实研究名） */
  getStudies(request: StudiesGetRequestParams): Promise<ParsedPayloadResponse>;

  /** options_statistics：期权链统计 snapshot+patch 推送流 */
  subscribeOptionsStatistics(
    request: OptionsStatisticsRequestParams,
  ): AsyncIterable<ParsedPayloadResponse>;

  /** order_history：订单历史（epoch 秒、窗口 ≤370 天、真实账户 code） */
  getOrderHistory(
    request: OrderHistoryRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /** tax_lot/get：税则批次（guest 被拒） */
  getTaxLots(request: TaxLotGetRequestParams): Promise<ParsedPayloadResponse>;

  /**
   * transactions/categories：交易流水分类目录。6 参数必填
   * {startTime,endTime,account,transactionCategories,
   * cryptoTransactionTypes,cashFutureTransactionTypes}，后三个可为空数组；
   * 只发 account 报校验错误。
   */
  getTransactionCategories(
    request: TransactionsCategoriesRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /** chat_global/messages：chat 全局公告流（首帧 snapshot，变更推送） */
  subscribeGlobalChats(): AsyncIterable<ParsedPayloadResponse>;

  /** support_chats：客服会话列表 */
  getSupportChats(): Promise<ParsedPayloadResponse>;

  /** user_properties/set：写用户属性（写操作，参数形状未验证） */
  setUserProperties(
    request: UserPropertiesSetRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /** disclosures/accept：接受披露协议（写操作，disclosureIds 非空） */
  acceptDisclosures(
    request: DisclosuresAcceptRequestParams,
  ): Promise<ParsedPayloadResponse>;
}
