import { Disposable } from "../server/disposable.js";
import { ChartRequestParams } from "./services/chartMessageHandler.js";
import { CreateAlertRequestParams } from "./services/createAlertMessageHandler.js";
import { RawLoginResponseBody } from "./services/loginMessageHandler.js";
import { MarketHoursRequestParams } from "./services/marketHoursMessageHandler.js";
import { OptionChainDetailsRequest } from "./services/optionChainDetailsMessageHandler.js";
import { OptionQuotesRequestParams } from "./services/optionQuotesMessageHandler.js";
import { PlaceLimitOrderRequestParams } from "./services/placeOrderMessageHandler.js";
import {
  SubmitDraftOrderRequestParams,
  ReplaceOrderRequestParams,
} from "./services/submitOrderMessageHandler.js";
import { WatchlistCategoriesRequestParams } from "./services/watchlistCategoriesMessageHandler.js";
import { WatchlistCreateRequestParams } from "./services/watchlistCreateMessageHandler.js";
import { WatchlistRenameRequestParams } from "./services/watchlistRenameMessageHandler.js";
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

  quotes(symbols: string[]): AsyncIterable<ParsedPayloadResponse>;

  accountPositions(accountNumber: string): AsyncIterable<ParsedPayloadResponse>;

  /** accountPositions 的语义别名（agent/07：门面统一 get* 命名） */
  getPositions(accountNumber: string): AsyncIterable<ParsedPayloadResponse>;

  chart(request: ChartRequestParams): AsyncIterable<ParsedPayloadResponse>;

  searchInstruments(query: string): Promise<ParsedPayloadResponse>;

  lookupAlerts(): AsyncIterable<ParsedPayloadResponse>;

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
}
