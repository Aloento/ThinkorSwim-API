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

export interface WsJsonClient extends Disposable {
  authenticateWithAuthCode(
    authCode: string,
  ): Promise<RawLoginResponseBody | null>;

  authenticateWithAccessToken(args: {
    accessToken: string;
    /** refreshToken 可选：guest 路径没有 refresh token（agent/07） */
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

  /** accountPositions 的语义别名（agent/07：门面统一 get* 命名） */
  getPositions(accountNumber: string): AsyncIterable<ParsedPayloadResponse>;

  chart(request: ChartRequestParams): AsyncIterable<ParsedPayloadResponse>;

  searchInstruments(query: string): Promise<ParsedPayloadResponse>;

  lookupAlerts(): AsyncIterable<ParsedPayloadResponse>;

  /**
   * alerts/subscribe：告警事件流（task-14B）。alertTypes 缺省
   * DEFAULT_ALERT_TYPES（CHANGED/TRIGGERED/EXPIRED/MULTIPLE_EXPIRED）。
   */
  subscribeAlerts(alertTypes?: string[]): AsyncIterable<ParsedPayloadResponse>;

  /** order_events 原始事件流（task-14A）：body.orders[] 为 wire 原样 */
  orderEvents(
    request: OrderEventsRequestParams,
  ): AsyncIterable<ParsedPayloadResponse>;

  /** 归一化订单事件流（task-14A）：orders[] 逐条展平 + status 归一 */
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
   * 下单第一步（W1 实测）：place_order action=CONFIRM ver=1，
   * header.id = update-draft-order-<SYMBOL>。返回草稿 snapshot。
   */
  confirmOrder(
    draft: PlaceLimitOrderRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /**
   * 下单第二步（W2 实测）：place_order action=SUBMIT ver=0，
   * **必须复用 confirmOrder 的草稿 id**（update-draft-order-<SYMBOL>），
   * 换 id 报 "Can not submit while prices are not available!"。
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

  // ---- 账户域（agent/07，probe-2026-10-13 实测背书）----

  getAccounts(): Promise<ParsedPayloadResponse>;

  getStatement(account: string): Promise<ParsedPayloadResponse>;

  getMarginCalls(): Promise<ParsedPayloadResponse>;

  /** market_hours：参数是 {markets, date}，不是 exchanges（06 第 2 节） */
  getMarketHours(
    request: MarketHoursRequestParams,
  ): Promise<ParsedPayloadResponse>;

  getDisclosures(): Promise<ParsedPayloadResponse>;

  getMessageCenter(): Promise<ParsedPayloadResponse>;

  /** message_center/subscribe：实测零参数，返回持续推送 */
  subscribeMessageCenter(): AsyncIterable<ParsedPayloadResponse>;

  // ---- 自选列表（write-2026-10-13 W5 系列实测）----

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

  /** watchlist/add：响应为合并后的完整 watchlist（W5f 实测） */
  addToWatchlist(
    watchlistId: number,
    symbols: string[],
  ): Promise<ParsedPayloadResponse>;

  /** watchlist/remove：响应为删除成分后的完整 watchlist（W5f 实测） */
  removeFromWatchlist(
    watchlistId: number,
    symbols: string[],
  ): Promise<ParsedPayloadResponse>;

  /** watchlist/rearrange：symbols 为新顺序，响应为空对象（W5f 实测） */
  rearrangeWatchlist(
    watchlistId: number,
    symbols: string[],
  ): Promise<ParsedPayloadResponse>;

  // ---- 第四批（agent/07 §"第四批接入契约"，task-8 handler 全量接入）----
  // 一次性 Promise 型走 dispatchOneShot（task-6 语义：断线 reject 不重放）。

  /** study/categories：研究指标目录（26 分类/441 研究，实测成功帧） */
  getStudyCategories(): Promise<ParsedPayloadResponse>;

  /** study/subscribe：指标数值推送流（guest 权限受限，参数按校验帧） */
  subscribeStudies(
    request: StudySubscribeRequestParams,
  ): AsyncIterable<ParsedPayloadResponse>;

  /** scan_filter/get：screener 筛选器目录（实测成功帧） */
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

  /** scan_query/save：保存 screener 查询（bundle 证据） */
  saveScanQuery(
    request: ScanQuerySaveRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /** quotes/get：一次性报价快照（不建立持续订阅；实测成功帧） */
  getQuotes(request: QuotesGetRequestParams): Promise<ParsedPayloadResponse>;

  /** fundamentals/history：历史基本面序列（guest 校验帧未过，待真实账户） */
  getFundamentalsHistory(
    request: FundamentalsHistoryRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /** access_token/get：refreshToken 换 accessToken（token 续期，wsjson 通道） */
  getAccessToken(
    request: AccessTokenGetRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /** auth_code/get：refreshToken 换一次性 auth code（bundle 证据） */
  getAuthCode(
    request: AuthCodeGetRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /** analyst_reports/token：分析师报告第三方访问 token（实测成功帧） */
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

  /** news_headers/subscribe：新闻标题推送流（bundle 证据，未实测） */
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

  /** tax_lot/update：税批选择更新（bundle 证据，未实测） */
  updateTaxLot(
    request: TaxLotUpdateRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /** unsubscribe：取消订阅（资源清理，实测线上帧） */
  unsubscribe(
    request: UnsubscribeRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /**
   * ⚠️ demo_account/set_balance：重置模拟盘余额——破坏性资金操作，
   * 成功帧 guest 未实测；绝不要在共享/真实账户会话上冒烟调用。
   * @deprecated 危险操作：仅在自建 demo 账户上显式使用。
   */
  demoAccountSetBalance(
    request: DemoAccountSetBalanceRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /**
   * ⚠️ demo_account/adjust_cash：模拟盘现金划转——破坏性资金操作；
   * 绝不要在共享/真实账户会话上冒烟调用。
   * @deprecated 危险操作：仅在自建 demo 账户上显式使用。
   */
  demoAccountAdjustCash(
    request: DemoAccountAdjustCashRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /**
   * ⚠️ logoff/schwab：终止服务端 Schwab 会话——调用后当前 accessToken 失效，
   * 需完整重认证。绝不要在冒烟里调用。
   * @deprecated 危险操作：终结会话，仅显式登出时使用。
   */
  logoff(request: LogoffSchwabRequestParams): Promise<ParsedPayloadResponse>;

  // ---- 第五批（agent/07 §"第五批接入契约"，task-5/2 批次 11 个 handler 收尾）----

  /** news_headers/get：新闻标题 snapshot（实测参数 [symbol, limit?]） */
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

  /** tax_lot/get：税则批次（guest 被拒，真实账户待测） */
  getTaxLots(request: TaxLotGetRequestParams): Promise<ParsedPayloadResponse>;

  /**
   * transactions/categories：账户交易流水分类目录。
   * 真实账户实测（exp-tc.mjs）：6 参数 {startTime,endTime,account,
   * transactionCategories,cryptoTransactionTypes,cashFutureTransactionTypes}
   * 必填（后三个可空数组），只发 account 报校验错误。
   */
  getTransactionCategories(
    request: TransactionsCategoriesRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /** chat_global/messages：chat 全局公告流（首帧 snapshot，变更推送） */
  subscribeGlobalChats(): AsyncIterable<ParsedPayloadResponse>;

  /** support_chats：客服会话列表（guest 实测空 body） */
  getSupportChats(): Promise<ParsedPayloadResponse>;

  /**
   * ⚠️ user_properties/set：写用户属性（写操作，参数形状未实测确认）。
   */
  setUserProperties(
    request: UserPropertiesSetRequestParams,
  ): Promise<ParsedPayloadResponse>;

  /**
   * ⚠️ disclosures/accept：接受披露协议（写操作，disclosureIds 非空）。
   */
  acceptDisclosures(
    request: DisclosuresAcceptRequestParams,
  ): Promise<ParsedPayloadResponse>;
}
