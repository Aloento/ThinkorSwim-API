import debug from "debug";
import WebSocket from "isomorphic-ws";
import {
  BufferedIterator,
  deferredWrap,
  MulticastIterator,
  Observable,
} from "obgen";
import {
  isConnectionResponse,
  isLoginResponse,
  isResponseForRequest,
  isSchwabLoginResponse,
} from "./messageTypeHelpers.js";
import ResponseParser from "./responseParser.js";
import SubscriptionStream from "./subscriptionStream.js";
// ---- 扩展服务 handler 与其参数类型----
import AccessTokenGetMessageHandler, {
  AccessTokenGetRequestParams,
} from "./services/accessTokenGetMessageHandler.js";
import AnalystReportsTokenMessageHandler from "./services/analystReportsTokenMessageHandler.js";
import AuthCodeGetMessageHandler, {
  AuthCodeGetRequestParams,
} from "./services/authCodeGetMessageHandler.js";
import ChatCreateMessageHandler, {
  ChatCloseMessageHandler,
  ChatCloseRequestParams,
  ChatCreateRequestParams,
  ChatSendMessageMessageHandler,
  ChatSendMessageRequestParams,
  SupportChatMessagesMessageHandler,
  SupportChatMessagesRequestParams,
} from "./services/supportChatMessageHandlers.js";
import DemoAccountSetBalanceMessageHandler, {
  DemoAccountAdjustCashMessageHandler,
  DemoAccountAdjustCashRequestParams,
  DemoAccountSetBalanceRequestParams,
} from "./services/demoAccountMessageHandlers.js";
import DrawingCreateMessageHandler, {
  DrawingCreateRequestParams,
  DrawingDeleteMessageHandler,
  DrawingDeleteRequestParams,
  DrawingSetCreateMessageHandler,
  DrawingSetCreateRequestParams,
  DrawingSetDeleteMessageHandler,
  DrawingSetDeleteRequestParams,
  DrawingUpdateMessageHandler,
  DrawingUpdateRequestParams,
} from "./services/drawingMessageHandlers.js";
import DrawingSetsMessageHandler, {
  DrawingsMessageHandler,
  DrawingsRequestParams,
  DrawingSetsRequestParams,
} from "./services/drawingSetsMessageHandlers.js";
import FundamentalsHistoryMessageHandler, {
  FundamentalsHistoryRequestParams,
} from "./services/fundamentalsHistoryMessageHandler.js";
import LogoffSchwabMessageHandler, {
  LogoffSchwabRequestParams,
} from "./services/logoffSchwabMessageHandler.js";
import NewsHeadersSubscribeRelevantMessageHandler, {
  NewsBodyMessageHandler,
  NewsBodyRequestParams,
  NewsHeadersSubscribeRelevantRequestParams,
} from "./services/newsBodyMessageHandlers.js";
import NewsHeadersGetRelevantMessageHandler, {
  NewsHeadersGetRelevantRequestParams,
} from "./services/newsHeadersGetRelevantMessageHandler.js";
import NewsHeadersSubscribeMessageHandler, {
  NewsHeadersSubscribeRequestParams,
} from "./services/newsHeadersSubscribeMessageHandler.js";
import QuotesGetMessageHandler, {
  QuotesGetRequestParams,
} from "./services/quotesGetMessageHandler.js";
import ScanFilterGetMessageHandler, {
  ScanFilterGetRequestParams,
} from "./services/scanFilterGetMessageHandler.js";
import ScanFilterParametersMessageHandler, {
  ScanFilterParametersRequestParams,
} from "./services/scanFilterParametersMessageHandler.js";
import ScanQueryGetMessageHandler, {
  ScanQueryGetRequestParams,
} from "./services/scanQueryGetMessageHandler.js";
import ScanQuerySaveMessageHandler, {
  ScanQuerySaveRequestParams,
} from "./services/scanQuerySaveMessageHandler.js";
import StudyCategoriesMessageHandler from "./services/studyCategoriesMessageHandler.js";
import StudySubscribeMessageHandler, {
  StudySubscribeRequestParams,
} from "./services/studySubscribeMessageHandler.js";
import TaxLotUpdateMessageHandler, {
  TaxLotUpdateRequestParams,
} from "./services/taxLotUpdateMessageHandler.js";
import UnsubscribeMessageHandler, {
  UnsubscribeRequestParams,
} from "./services/unsubscribeMessageHandler.js";
import AccountsMessageHandler from "./services/accountsMessageHandler.js";
import AlertLookupMessageHandler from "./services/alertLookupMessageHandler.js";
import CancelAlertMessageHandler from "./services/cancelAlertMessageHandler.js";
import CancelOrderMessageHandler from "./services/cancelOrderMessageHandler.js";
import ChartMessageHandler, {
  ChartRequestParams,
} from "./services/chartMessageHandler.js";
import CreateAlertMessageHandler, {
  CreateAlertRequestParams,
} from "./services/createAlertMessageHandler.js";
import DisclosuresMessageHandler from "./services/disclosuresMessageHandler.js";
import GenericIncomingMessageHandler from "./services/genericIncomingMessageHandler.js";
import GetWatchlistMessageHandler from "./services/getWatchlistMessageHandler.js";
import InstrumentSearchMessageHandler from "./services/instrumentSearchMessageHandler.js";
import LoginMessageHandler, {
  RawLoginResponse,
  RawLoginResponseBody,
} from "./services/loginMessageHandler.js";
import MarginCallsMessageHandler from "./services/marginCallsMessageHandler.js";
import MarketDepthMessageHandler from "./services/marketDepthMessageHandler.js";
import MarketHoursMessageHandler, {
  MarketHoursRequestParams,
} from "./services/marketHoursMessageHandler.js";
import MessageCenterGetMessageHandler from "./services/messageCenterGetMessageHandler.js";
import MessageCenterSubscribeMessageHandler from "./services/messageCenterSubscribeMessageHandler.js";
import OptionChainDetailsMessageHandler, {
  OptionChainDetailsRequest,
} from "./services/optionChainDetailsMessageHandler.js";
import OptionQuotesMessageHandler, {
  OptionQuotesRequestParams,
} from "./services/optionQuotesMessageHandler.js";
import OptionSeriesMessageHandler from "./services/optionSeriesMessageHandler.js";
import OptionSeriesQuotesMessageHandler from "./services/optionSeriesQuotesMessageHandler.js";
import OrderEventsMessageHandler, {
  NormalizedOrderEvent,
  OrderEventsRequestParams,
  RawOrderEvent,
  normalizeOrderEvent,
} from "./services/orderEventsMessageHandler.js";
import PlaceOrderMessageHandler, {
  PlaceLimitOrderRequestParams,
} from "./services/placeOrderMessageHandler.js";
import PositionsMessageHandler from "./services/positionsMessageHandler.js";
import QuotesMessageHandler from "./services/quotesMessageHandler.js";
import SchwabLoginMessageHandler from "./services/schwabLoginMessageHandler.js";
import StatementMessageHandler from "./services/statementMessageHandler.js";
import SubmitOrderMessageHandler, {
  ReplaceOrderRequestParams,
  SubmitDraftOrderRequestParams,
} from "./services/submitOrderMessageHandler.js";
import SubscribeToAlertMessageHandler, {
  DEFAULT_ALERT_TYPES,
} from "./services/subscribeToAlertMessageHandler.js";
import UserPropertiesMessageHandler from "./services/userPropertiesMessageHandler.js";
import WatchlistAddMessageHandler from "./services/watchlistAddMessageHandler.js";
import WatchlistCategoriesMessageHandler, {
  WatchlistCategoriesRequestParams,
} from "./services/watchlistCategoriesMessageHandler.js";
import WatchlistCreateMessageHandler, {
  WatchlistCreateRequestParams,
} from "./services/watchlistCreateMessageHandler.js";
import WatchlistDeleteMessageHandler from "./services/watchlistDeleteMessageHandler.js";
import WatchlistRemoveMessageHandler from "./services/watchlistRemoveMessageHandler.js";
import WatchlistRenameMessageHandler, {
  WatchlistRenameRequestParams,
} from "./services/watchlistRenameMessageHandler.js";
import WatchlistRearrangeMessageHandler from "./services/watchlistRearrangeMessageHandler.js";
import WebSocketApiMessageHandler from "./services/webSocketApiMessageHandler.js";
import WorkingOrdersMessageHandler from "./services/workingOrdersMessageHandler.js";
// ---- 补充服务 handler 与其参数类型----
import ChatGlobalMessagesMessageHandler from "./services/chatGlobalMessagesMessageHandler.js";
import DisclosuresAcceptMessageHandler, {
  DisclosuresAcceptRequestParams,
} from "./services/disclosuresAcceptMessageHandler.js";
import FundamentalsCurrentMessageHandler, {
  FundamentalsCurrentRequestParams,
} from "./services/fundamentalsCurrentMessageHandler.js";
import NewsHeadersGetMessageHandler, {
  NewsHeadersGetRequestParams,
} from "./services/newsHeadersGetMessageHandler.js";
import OptionsStatisticsMessageHandler, {
  OptionsStatisticsRequestParams,
} from "./services/optionsStatisticsMessageHandler.js";
import OrderHistoryMessageHandler, {
  OrderHistoryRequestParams,
} from "./services/orderHistoryMessageHandler.js";
import StudiesGetMessageHandler, {
  StudiesGetRequestParams,
} from "./services/studiesGetMessageHandler.js";
import SupportChatsMessageHandler from "./services/supportChatsMessageHandler.js";
import TaxLotGetMessageHandler, {
  TaxLotGetRequestParams,
} from "./services/taxLotGetMessageHandler.js";
import TransactionsCategoriesMessageHandler, {
  TransactionsCategoriesRequestParams,
} from "./services/transactionsCategoriesMessageHandler.js";
import UserPropertiesSetMessageHandler, {
  UserPropertiesSetRequestParams,
} from "./services/userPropertiesSetMessageHandler.js";
import {
  AuthError,
  ParsedPayloadResponse,
  RawPayloadRequest,
  RawPayloadResponse,
  TransportError,
  WebSocketApiError,
  WsJsonRawMessage,
} from "./tdaWsJsonTypes.js";
import { Constructor, debugLog, ensure, findByTypeOrThrow } from "./util.js";
import { WsJsonClient } from "./wsJsonClient.js";
import Authenticator from "../auth/authenticator.js";
import { GuardOptions, GuardOrderCheck, OrderGuard } from "./guard.js";

export const CONNECTION_REQUEST_MESSAGE = {
  ver: "27.*.*",
  fmt: "json-patches-structured",
  heartbeat: "2s",
};

export enum ChannelState {
  DISCONNECTED,
  CONNECTING,
  CONNECTED,
  ERROR,
}

const logger = debug("realWsJsonClient");

/**
 * SUBMIT 完成帧（跨 ver patch 合并后）的 orderId 在
 * `body.orders[0].orderId`；草稿期该字段是占位 0（W1/W2 实测），
 * 因此「orderId > 0」即终态帧判据。
 */
function extractOrderId(msg: ParsedPayloadResponse): number | undefined {
  const orders = (msg.body as { orders?: { orderId?: unknown }[] } | undefined)
    ?.orders;
  const raw = orders?.[0]?.orderId;
  return typeof raw === "number" && raw > 0 ? raw : undefined;
}

const messageHandlers: WebSocketApiMessageHandler<never>[] = [
  new CancelAlertMessageHandler(),
  new CreateAlertMessageHandler(),
  new AlertLookupMessageHandler(),
  new SubscribeToAlertMessageHandler(),
  // workingOrders 此前 new 局部 handler（绕过查表），现注册后
  // 统一走 dispatchHandler（与其余门面一致）。
  new WorkingOrdersMessageHandler(),
  new OptionQuotesMessageHandler(),
  new CancelOrderMessageHandler(),
  new ChartMessageHandler(),
  new InstrumentSearchMessageHandler(),
  new OptionSeriesMessageHandler(),
  new OptionSeriesQuotesMessageHandler(),
  new OrderEventsMessageHandler(),
  new PlaceOrderMessageHandler(),
  new PositionsMessageHandler(),
  new QuotesMessageHandler(),
  new UserPropertiesMessageHandler(),
  new OptionChainDetailsMessageHandler(),
  new LoginMessageHandler(),
  new SchwabLoginMessageHandler(),
  new SubmitOrderMessageHandler(),
  new MarketDepthMessageHandler(),
  new GetWatchlistMessageHandler(),
  new AccountsMessageHandler(),
  new StatementMessageHandler(),
  new MarketHoursMessageHandler(),
  new MarginCallsMessageHandler(),
  new DisclosuresMessageHandler(),
  new MessageCenterGetMessageHandler(),
  new MessageCenterSubscribeMessageHandler(),
  new WatchlistCategoriesMessageHandler(),
  new WatchlistCreateMessageHandler(),
  new WatchlistRenameMessageHandler(),
  new WatchlistDeleteMessageHandler(),
  new WatchlistAddMessageHandler(),
  new WatchlistRemoveMessageHandler(),
  new WatchlistRearrangeMessageHandler(),
  // ---- 扩展服务：全部 31 个 handler 注册（dispatchOneShot/
  // dispatchHandler 经 findByTypeOrThrow 查表，漏注册 = 运行时抛错）----
  new StudyCategoriesMessageHandler(),
  new StudySubscribeMessageHandler(),
  new ScanFilterGetMessageHandler(),
  new ScanFilterParametersMessageHandler(),
  new ScanQueryGetMessageHandler(),
  new ScanQuerySaveMessageHandler(),
  new QuotesGetMessageHandler(),
  new FundamentalsHistoryMessageHandler(),
  new AccessTokenGetMessageHandler(),
  new AuthCodeGetMessageHandler(),
  new AnalystReportsTokenMessageHandler(),
  new DrawingCreateMessageHandler(),
  new DrawingUpdateMessageHandler(),
  new DrawingDeleteMessageHandler(),
  new DrawingSetCreateMessageHandler(),
  new DrawingSetDeleteMessageHandler(),
  new DrawingSetsMessageHandler(),
  new DrawingsMessageHandler(),
  new NewsHeadersGetRelevantMessageHandler(),
  new NewsHeadersSubscribeMessageHandler(),
  new NewsHeadersSubscribeRelevantMessageHandler(),
  new NewsBodyMessageHandler(),
  new ChatCreateMessageHandler(),
  new ChatCloseMessageHandler(),
  new ChatSendMessageMessageHandler(),
  new SupportChatMessagesMessageHandler(),
  new TaxLotUpdateMessageHandler(),
  new UnsubscribeMessageHandler(),
  new DemoAccountSetBalanceMessageHandler(),
  new DemoAccountAdjustCashMessageHandler(),
  new LogoffSchwabMessageHandler(),
  // ---- 补充服务：11 个漏接 handler 全量注册（同样经
  // findByTypeOrThrow 查表，漏注册 = 运行时抛错）----
  new NewsHeadersGetMessageHandler(),
  new FundamentalsCurrentMessageHandler(),
  new StudiesGetMessageHandler(),
  new OptionsStatisticsMessageHandler(),
  new OrderHistoryMessageHandler(),
  new TaxLotGetMessageHandler(),
  new TransactionsCategoriesMessageHandler(),
  new ChatGlobalMessagesMessageHandler(),
  new SupportChatsMessageHandler(),
  new UserPropertiesSetMessageHandler(),
  new DisclosuresAcceptMessageHandler(),
];

export const DEFAULT_WS_URL =
  "wss://thinkorswim-services.schwab.com/Services/WsJson";
export const PAPER_WS_URL =
  "wss://papermoney-services.schwab.com/Services/WsJson";

export type RealWsJsonClientOptions = {
  /** 数据中心端点：真实=DEFAULT_WS_URL，模拟盘=PAPER_WS_URL（token 与 DC 绑定） */
  wsUrl?: string;
  /** 可选 Cookie 头（部分场景需要携带登录会话 cookie） */
  cookie?: string;
  userAgent?: string;
  /**
   * WebSocket 工厂。重连必须使用全新连接（socket 不可复用），因此重连走
   * 工厂而非构造时注入的 socket。默认 `(url, headers) => new WebSocket(url, { headers })`。
   */
  socketFactory?: (url: string, headers: Record<string, string>) => WebSocket;
  /** 握手（connect + login 完成）超时，默认 15s；超时后 reject 并触发重连 */
  handshakeTimeoutMs?: number;
  /** 心跳看门狗：连续 N ms 未收到 {heartbeat} 帧判定死链主动 close（实测线上约 2s 一次）。默认 10_000，0 关闭 */
  heartbeatTimeoutMs?: number;
  /** 重连退避初始延迟，默认 500ms */
  reconnectBackoffInitialMs?: number;
  /** 重连退避上限，默认 30s */
  reconnectBackoffMaxMs?: number;
  /** 退避抖动比例 0~1（默认 0.2）；设 0 得到确定性延迟（便于测试） */
  reconnectJitterRatio?: number;
  /** 意外断开（含心跳判死）后是否自动重连，默认 true（仅限曾成功认证过的会话） */
  autoReconnect?: boolean;
  /**
   * 流式订阅提前退出（for-await break / throw）时是否向服务端 best-effort
   * 发送 unsubscribe 帧（P4 资源联动，见 releaseSubscription）。默认 true；
   * "No subscription" 等错误静默忽略。测试可关。
   */
  autoUnsubscribe?: boolean;
  /**
   * 交易安全闸门：confirmOrder/submitOrder/replaceOrder/
   * cancelOrder 入口前置校验，不通过抛 GuardError。默认 undefined =
   * 不启用（零行为变化）。paperOnly 判定本会话 wsUrl 是否
   * papermoney-services 端点，详见 src/client/guard.ts。
   */
  guard?: GuardOptions;
};

export class RealWsJsonClient implements WsJsonClient {
  private readonly genericHandler = new GenericIncomingMessageHandler();
  private buffer = new BufferedIterator<ParsedPayloadResponse>();
  private iterator = new MulticastIterator(this.buffer);
  private state = ChannelState.DISCONNECTED;
  private credentials: {
    authCode?: string;
    accessToken?: string;
    refreshToken?: string;
    /** accessToken 获取时刻（epoch ms），Authenticator 续期挂点用 */
    obtainedAt?: number;
  } = {};
  private readonly options: RealWsJsonClientOptions;
  private readonly handshakeTimeoutMs: number;
  private readonly heartbeatTimeoutMs: number;
  private readonly reconnectBackoffInitialMs: number;
  private readonly reconnectBackoffMaxMs: number;
  private readonly reconnectJitterRatio: number;
  private readonly autoReconnect: boolean;
  private readonly autoUnsubscribe: boolean;
  /**
   * 可选的 token 续期器（R1）：重连 re-login 前经 getValidToken() 拿最新
   * accessToken（跨 24h 的重连不会拿旧 token 去登录）。
   */
  private authenticator?: Authenticator;
  /** 交易安全闸门；未配置 guard 时为 undefined = 不启用 */
  private readonly guard?: OrderGuard;
  /** 本轮 authenticate() 是否正在等 refresh（防 close 竞态的迟到续发登录帧） */
  private loginAttemptId = 0;
  /** 构造时注入的 socket（测试注入用）；仅首次连接消费，重连一律走工厂 */
  private injectedSocket?: WebSocket;
  private socket?: WebSocket;
  /** 当前握手尝试的 settle 回调（login 响应到达 / 断开 / 超时时结算） */
  private pendingHandshake?: {
    resolve: (value: RawLoginResponseBody) => void;
    reject: (err: Error) => void;
  };
  /** 手动 reconnect() 的等待者；下次成功 login 时 resolve，显式 disconnect 时 reject */
  private reconnectPromise?: Promise<void>;
  private resolveReconnect?: () => void;
  private rejectReconnect?: (err: Error) => void;
  private handshakeTimer?: ReturnType<typeof setTimeout>;
  private heartbeatTimer?: ReturnType<typeof setTimeout>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempts = 0;
  /** 是否曾经成功登录过——自动重连只对"活过的会话"生效，凭据错误不无限重试 */
  private hasAuthenticated = false;
  /** 用户显式 disconnect() 后置 true：close 不再触发自动重连 */
  private explicitDisconnect = false;
  /**
   * 流式订阅的原始请求（key = `service$id`，插入序）。重连成功并重新 login
   * 后按序重发（服务端按 id 幂等重建订阅）。一次性请求不入此表。
   */
  private readonly activeRequests = new Map<string, RawPayloadRequest>();
  /**
   * 一次性（promise 型）dispatch 的等待者（key → reject）。连接断开时统一
   * reject（语义：失败重试交调用方）；正常完成后自行注销。
   */
  private readonly pendingOneShots = new Map<string, (err: Error) => void>();
  /** 本轮 login 成功后是否需要重放订阅并结算 reconnect() promise */
  private pendingReplayAfterLogin = false;
  /** buffer.end() 是否已调用（重连需重建缓冲时据此判断） */
  private bufferEnded = false;

  constructor(
    options: RealWsJsonClientOptions = {},
    socket?: WebSocket,
    private readonly responseParser = new ResponseParser(this.genericHandler),
  ) {
    this.options = options;
    this.injectedSocket = socket;
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? 15_000;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 10_000;
    this.reconnectBackoffInitialMs = options.reconnectBackoffInitialMs ?? 500;
    this.reconnectBackoffMaxMs = options.reconnectBackoffMaxMs ?? 30_000;
    this.reconnectJitterRatio = Math.min(
      1,
      Math.max(0, options.reconnectJitterRatio ?? 0.2),
    );
    this.autoReconnect = options.autoReconnect ?? true;
    this.autoUnsubscribe = options.autoUnsubscribe ?? true;
    this.guard = options.guard
      ? new OrderGuard(
          options.guard,
          // 模拟盘判定：wsUrl 含 papermoney-services（PAPER_WS_URL）
          (options.wsUrl ?? DEFAULT_WS_URL).includes("papermoney-services"),
        )
      : undefined;
  }

  private static buildHeaders(
    options: RealWsJsonClientOptions,
  ): Record<string, string> {
    return {
      Pragma: "no-cache",
      Origin: "https://trade.thinkorswim.com",
      Upgrade: "websocket",
      "Cache-Control": "no-cache",
      Connection: "Upgrade",
      "Sec-WebSocket-Version": "13",
      "Sec-WebSocket-Extensions": "permessage-deflate; client_max_window_bits",
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      "User-Agent":
        options.userAgent ??
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
    };
  }

  /** 首次连接优先用注入的 socket；之后（重连）一律走工厂/默认实现 */
  private createSocket(): WebSocket {
    if (this.injectedSocket) {
      const socket = this.injectedSocket;
      this.injectedSocket = undefined;
      return socket;
    }
    const url = this.options.wsUrl ?? DEFAULT_WS_URL;
    const headers = RealWsJsonClient.buildHeaders(this.options);
    if (this.options.socketFactory) {
      return this.options.socketFactory(url, headers);
    }
    return new WebSocket(url, { headers });
  }

  get accessToken() {
    return this.credentials.accessToken;
  }

  get refreshToken() {
    return this.credentials.refreshToken;
  }

  async authenticateWithAccessToken({
    accessToken,
    refreshToken,
  }: {
    accessToken: string;
    refreshToken?: string;
  }): Promise<RawLoginResponseBody | null> {
    ensure(accessToken, "access token is required");
    // R1：记录获取时刻——Authenticator 挂点（重连 re-login 前）据此判断续期
    this.credentials = { accessToken, refreshToken, obtainedAt: Date.now() };
    return await this.handshake();
  }

  async authenticateWithAuthCode(
    authCode: string,
  ): Promise<RawLoginResponseBody | null> {
    ensure(authCode, "auth code is required");
    this.credentials = { authCode };
    return await this.handshake();
  }

  private async handshake(): Promise<RawLoginResponseBody | null> {
    switch (this.state) {
      case ChannelState.DISCONNECTED:
        if (this.bufferEnded) {
          // 上一轮显式 disconnect 已把旧缓冲置为终态，重建供本轮使用
          this.buffer = new BufferedIterator<ParsedPayloadResponse>();
          this.iterator = new MulticastIterator(this.buffer);
          this.bufferEnded = false;
        }
        this.explicitDisconnect = false;
        this.state = ChannelState.CONNECTING;
        return await this.doConnect();
      case ChannelState.CONNECTING: // no-op
        return Promise.reject(new TransportError("Already connecting"));
      case ChannelState.CONNECTED: // no-op
        return Promise.reject(new TransportError("Already connected"));
      case ChannelState.ERROR:
        return Promise.reject(
          new TransportError("Illegal state, ws connection failed previously"),
        );
    }
  }

  private doConnect(): Promise<RawLoginResponseBody> {
    return new Promise((resolve, reject) => {
      const socket = this.createSocket();
      this.socket = socket;
      this.pendingHandshake = { resolve, reject };
      // R6：握手（open + connection request + login 往返）整体超时；0 关闭
      if (this.handshakeTimeoutMs > 0) {
        this.handshakeTimer = setTimeout(() => {
          debugLog("handshake timed out after %dms", this.handshakeTimeoutMs);
          const handshake = this.pendingHandshake;
          this.pendingHandshake = undefined;
          handshake?.reject(
            new TransportError(
              `Handshake timed out after ${this.handshakeTimeoutMs}ms`,
            ),
          );
          // close 触发统一的断连处理（重试调度等）
          socket.close();
        }, this.handshakeTimeoutMs);
      }
      if (socket.readyState === WebSocket.OPEN) {
        this.sendMessage(CONNECTION_REQUEST_MESSAGE);
      }
      socket.onopen = () => this.sendMessage(CONNECTION_REQUEST_MESSAGE);
      socket.onclose = (event) =>
        this.handleConnectionLost(socket, event?.reason || "socket closed");
      socket.onerror = (err) => debugLog("socket error: %O", err);
      socket.onmessage = ({ data }) => this.onMessage(data as string);
    });
  }

  /**
   * 统一的断连入口（close 事件 / 心跳看门狗判死 / 显式 close）。
   * `this.socket !== socket` 的守卫忽略旧 socket 的迟到 close 事件，避免
   * 迟到的 close 把刚建好的新连接误判为断开。
   */
  private handleConnectionLost(socket: WebSocket, reason: string) {
    if (this.socket !== socket) return; // stale close from a previous attempt
    this.socket = undefined;
    this.state = ChannelState.DISCONNECTED;
    this.clearHeartbeat();
    this.clearHandshakeTimer();
    debugLog("connection closed: %s", reason);
    // 握手期间的断开：让 authenticate()/reconnect() 的调用方拿到错误
    const handshake = this.pendingHandshake;
    this.pendingHandshake = undefined;
    handshake?.reject(
      new TransportError(`Connection lost before login completed: ${reason}`),
    );
    // 一次性（promise 型）等待者：断开即 reject，重发重试是调用方的事
    // （SUBMIT 完成帧的等待者走通用一次性管道，drainOneShots 已覆盖，
    // 旧的 pendingSubmissions 专用排空随原始帧拦截一起删除）
    this.drainOneShots(`Connection lost: ${reason}`);
    const canRecover =
      !this.explicitDisconnect &&
      this.autoReconnect &&
      this.hasAuthenticated &&
      this.hasCredentials();
    if (!canRecover) {
      this.failReconnectPromise(
        new TransportError(`Disconnected while reconnecting: ${reason}`),
      );
      if (this.explicitDisconnect) return; // disconnect() 自己会收尾
      // 不再重连：结束流，让 for-await 循环干净退出
      this.endBuffer();
      return;
    }
    this.scheduleReconnect();
  }

  private onMessage(data: string) {
    const { responseParser, buffer } = this;
    let message: WsJsonRawMessage;
    // Isolate JSON.parse so a malformed frame cannot kill subsequent message handling.
    try {
      message = JSON.parse(data) as WsJsonRawMessage;
    } catch (e) {
      console.warn("⚠️ Received non-JSON websocket frame, ignoring: ", e);
      return;
    }
    logger("⬅️\treceived %O", message);
    // Isolate dispatch for the same reason: one bad frame must not break the stream.
    try {
      if (isConnectionResponse(message)) {
        this.authenticate();
      } else if ("heartbeat" in message) {
        // 心跳帧（实测线上约 2s 一次）：只用来重置看门狗
        this.startHeartbeatWatchdog();
      } else if (isLoginResponse(message)) {
        this.handleLoginResponse(message);
      } else if (isSchwabLoginResponse(message)) {
        this.handleSchwabLoginResponse(message);
      } else {
        // 全部业务帧走通用解析管道（旧的 SUBMIT 完成帧原始拦截
        // 已删除——storeKey 现在按 service+id 跨 ver 命中基底，ver:0 的
        // orderId patch 能正常合并进 ver:1 草稿基底）。
        const parsedResponse = responseParser.parseResponse(message);
        parsedResponse?.forEach((r) => buffer.emit(r));
      }
    } catch (e) {
      console.warn("⚠️ Failed to process websocket frame, ignoring: ", e);
    }
  }

  /**
   * 注入 token 续期器（R1）：authCode 会话登录成功、或调用方想把已连接
   * 客户端作为 access_token/get 刷新通道时挂上。
   */
  setAuthenticator(authenticator?: Authenticator): void {
    this.authenticator = authenticator;
  }

  private authenticate(): void {
    const {
      credentials: { authCode, accessToken },
    } = this;
    if (accessToken) {
      if (!this.authenticator) {
        // 无续期器：保持同步发送路径（首轮与重连的常规登录时序不变）
        this.sendAccessTokenLogin(accessToken);
        return;
      }
      // re-login（含重连路径）前经 authenticator 拿有效 token。
      // refresh 是异步的（access_token/get 走当前连接），期间的断连由
      // attemptId 守卫丢弃迟到的登录帧，避免旧会话 token 打进新会话。
      const attemptId = ++this.loginAttemptId;
      void this.authenticator
        .getValidToken()
        .then((token) => {
          this.credentials.accessToken = token;
          if (attemptId !== this.loginAttemptId) {
            debugLog("discarding stale login after token refresh");
            return;
          }
          this.sendAccessTokenLogin(token);
        })
        .catch((e) => {
          if (attemptId !== this.loginAttemptId) return;
          const err =
            e instanceof Error
              ? e
              : new AuthError(`token refresh failed: ${String(e)}`);
          debugLog("token refresh before login failed: %O", err);
          this.handleRefreshFailure(err);
        });
    } else if (authCode) {
      // exchange the auth code for an access token
      const handler = findByTypeOrThrow(
        messageHandlers,
        SchwabLoginMessageHandler,
      );
      this.sendMessage(handler.buildRequest(authCode));
    } else {
      throw new AuthError("no credentials provided, cannot authenticate");
    }
  }

  private sendAccessTokenLogin(accessToken: string) {
    // if we already have an access token, we can just authenticate with it
    const handler = findByTypeOrThrow(messageHandlers, LoginMessageHandler);
    this.sendMessage(handler.buildRequest(accessToken));
  }

  /**
   * 登录前 token 刷新失败：与 handleLoginFailure 同构（首轮终止会话不重试，
   * 重连尝试中按退避继续——refreshToken 可能只是暂时不可用），区别只在错误
   * 来自 Authenticator 而非服务端的 login 响应。
   */
  private handleRefreshFailure(err: Error) {
    this.clearHandshakeTimer();
    this.clearHeartbeat();
    const wasReconnectAttempt = this.pendingReplayAfterLogin;
    this.pendingReplayAfterLogin = false;
    const handshake = this.pendingHandshake;
    this.pendingHandshake = undefined;
    // 先摘掉 this.socket 再 close：close 事件被身份守卫忽略，自行决策重试
    const socket = this.socket;
    this.socket = undefined;
    this.state = ChannelState.ERROR;
    handshake?.reject(err);
    socket?.close();
    if (wasReconnectAttempt) {
      this.scheduleReconnect();
      return;
    }
    this.failReconnectPromise(err);
    this.drainOneShots(err.message);
    if (!this.bufferEnded) this.endBuffer();
  }

  // ---- 重连与看门狗 ----

  private hasCredentials(): boolean {
    const { authCode, accessToken } = this.credentials;
    return Boolean(authCode || accessToken);
  }

  private startHeartbeatWatchdog() {
    this.clearHeartbeat();
    if (this.heartbeatTimeoutMs <= 0) return;
    this.heartbeatTimer = setTimeout(() => {
      debugLog(
        "heartbeat watchdog: no heartbeat for %dms, treating connection as dead",
        this.heartbeatTimeoutMs,
      );
      // 假死链路：主动 close，走统一的断连→重连路径
      this.socket?.close();
    }, this.heartbeatTimeoutMs);
  }

  private clearHeartbeat() {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private clearHandshakeTimer() {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = undefined;
    }
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  /** 指数退避（0.5s 起、30s 封顶、默认 ±20% 抖动）调度下一次重连 */
  private scheduleReconnect() {
    if (this.reconnectTimer || this.explicitDisconnect) return;
    const attempt = this.reconnectAttempts++;
    const base = Math.min(
      this.reconnectBackoffInitialMs * 2 ** attempt,
      this.reconnectBackoffMaxMs,
    );
    const jitter =
      this.reconnectJitterRatio > 0
        ? base * this.reconnectJitterRatio * Math.random()
        : 0;
    const delay = Math.min(base + jitter, this.reconnectBackoffMaxMs);
    debugLog("scheduling reconnect attempt %d in %dms", attempt + 1, delay);
    this.reconnectTimer = setTimeout(() => void this.attemptReconnect(), delay);
  }

  private async attemptReconnect() {
    this.clearReconnectTimer();
    if (
      this.explicitDisconnect ||
      this.state === ChannelState.CONNECTED ||
      !this.hasCredentials()
    ) {
      this.failReconnectPromise(
        new AuthError("Cannot reconnect without credentials"),
      );
      return;
    }
    this.state = ChannelState.CONNECTING;
    // 登录成功后触发订阅重放（见 handleLoginResponse 成功路径）
    this.pendingReplayAfterLogin = true;
    try {
      await this.doConnect();
    } catch (e) {
      debugLog("reconnect attempt failed: %O", e);
      // 正常断连路径（handleConnectionLost/handleLoginFailure）已排队的
      // 这里被 reconnectTimer 守卫短路；兜底覆盖 close 事件缺失的极端
      // 情况（如 mock 环境），且仅当重连意图/自动重连策略仍成立时才继续。
      if (
        !this.explicitDisconnect &&
        (this.reconnectPromise || (this.autoReconnect && this.hasAuthenticated))
      ) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * 手动重连：立即断开当前连接（若有），以全新 WebSocket 走完
   * 握手 → 登录 → 订阅重放。返回的 promise 在成功登录并恢复订阅后
   * resolve；失败的尝试按指数退避持续重试，显式 disconnect() 则 reject。
   */
  reconnect(): Promise<void> {
    if (this.reconnectPromise) return this.reconnectPromise;
    this.clearReconnectTimer();
    this.clearHeartbeat();
    this.explicitDisconnect = false;
    this.reconnectAttempts = 0;
    if (this.bufferEnded) {
      // 显式 disconnect 之后流已终结；重建缓冲供重放使用（旧消费者
      // 的循环在 disconnect 时已干净退出，不会收到重放数据）。
      this.buffer = new BufferedIterator<ParsedPayloadResponse>();
      this.iterator = new MulticastIterator(this.buffer);
      this.bufferEnded = false;
    }
    const promise = new Promise<void>((resolve, reject) => {
      this.resolveReconnect = resolve;
      this.rejectReconnect = reject;
    });
    this.reconnectPromise = promise;
    if (!this.hasCredentials()) {
      this.failReconnectPromise(
        new AuthError("Cannot reconnect without credentials"),
      );
      return promise;
    }
    // 踢掉当前连接（若有）；close 事件因 socket 身份守卫被忽略
    const current = this.socket;
    this.socket = undefined;
    const handshake = this.pendingHandshake;
    this.pendingHandshake = undefined;
    handshake?.reject(new TransportError("Reconnect requested"));
    current?.close();
    void this.attemptReconnect();
    return promise;
  }

  /** 登录成功后的公共状态迁移（首轮与重连共用） */
  private onLoginSuccess(body: RawLoginResponseBody) {
    this.state = ChannelState.CONNECTED;
    this.hasAuthenticated = true;
    this.reconnectAttempts = 0;
    this.clearHandshakeTimer();
    this.startHeartbeatWatchdog();
    const handshake = this.pendingHandshake;
    this.pendingHandshake = undefined;
    handshake?.resolve(body);
    if (this.pendingReplayAfterLogin) {
      this.pendingReplayAfterLogin = false;
      this.replayActiveRequests();
      const resolve = this.resolveReconnect;
      this.reconnectPromise = undefined;
      this.resolveReconnect = undefined;
      this.rejectReconnect = undefined;
      resolve?.();
    }
  }

  /**
   * 重连成功后按订阅顺序原样重发流式请求（service+id 不变，服务端
   * 按 id 重建订阅）。一次性（promise 型）请求不在此列——它们在断开
   * 时已 reject，重试是调用方的责任。
   */
  private replayActiveRequests() {
    if (this.activeRequests.size === 0) return;
    logger(
      "replaying %d active subscription(s) after reconnect",
      this.activeRequests.size,
    );
    for (const request of [...this.activeRequests.values()]) {
      this.sendMessage(request);
    }
  }

  /** 一次性（promise 型）等待者：断开即 reject，重发重试是调用方的事 */
  private drainOneShots(reason: string) {
    if (this.pendingOneShots.size === 0) return;
    const waiters = [...this.pendingOneShots.values()];
    this.pendingOneShots.clear();
    const err = new TransportError(`Connection lost: ${reason}`);
    for (const reject of waiters) reject(err);
  }

  private endBuffer() {
    this.bufferEnded = true;
    // This ensures that listeners will resolve the promise cleanly from any `for await` loops
    this.buffer.end();
    // 整个会话终结、所有流消费者随之退出——全量回收
    // dataStore 补丁基底。重连恢复路径不走这里（消费者还活着，基底要留给
    // 重放后的增量 patch）。
    this.responseParser.clearStores();
  }

  private failReconnectPromise(err: Error) {
    const reject = this.rejectReconnect;
    this.reconnectPromise = undefined;
    this.resolveReconnect = undefined;
    this.rejectReconnect = undefined;
    reject?.(err);
  }

  isConnected(): boolean {
    return this.state === ChannelState.CONNECTED;
  }

  isConnecting(): boolean {
    return this.state === ChannelState.CONNECTING;
  }

  ensureConnected() {
    if (this.state !== ChannelState.CONNECTED) {
      throw new TransportError("Please call connect() first");
    }
  }

  quotes(symbols: string[]): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatchHandler(QuotesMessageHandler, symbols).iterable();
  }

  accountPositions(
    accountNumber: string,
  ): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatchHandler(
      PositionsMessageHandler,
      accountNumber,
    ).iterable();
  }

  chart(request: ChartRequestParams): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatchHandler(ChartMessageHandler, request).iterable();
  }

  searchInstruments(query: string): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(InstrumentSearchMessageHandler, {
      query,
    });
  }

  lookupAlerts(): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatchHandler(
      AlertLookupMessageHandler,
      null as never,
    ).iterable();
  }

  /**
   * alerts/subscribe 告警事件流：alertTypes 缺省
   * DEFAULT_ALERT_TYPES（CHANGED/TRIGGERED/EXPIRED/MULTIPLE_EXPIRED），
   * 服务端在告警状态变化时持续推送 snapshot 帧。
   */
  subscribeAlerts(
    alertTypes: string[] = DEFAULT_ALERT_TYPES,
  ): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatchHandler(
      SubscribeToAlertMessageHandler,
      alertTypes,
    ).iterable();
  }

  optionChain(symbol: string): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(OptionSeriesMessageHandler, symbol);
  }

  optionChainQuotes(symbol: string): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatchHandler(
      OptionSeriesQuotesMessageHandler,
      symbol,
    ).iterable();
  }

  optionChainDetails(
    request: OptionChainDetailsRequest,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(OptionChainDetailsMessageHandler, request);
  }

  optionQuotes(
    request: OptionQuotesRequestParams,
  ): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatchHandler(OptionQuotesMessageHandler, request).iterable();
  }

  async placeOrder(
    request: PlaceLimitOrderRequestParams,
  ): Promise<ParsedPayloadResponse> {
    // 两步下单（W1+W2）：先 CONFIRM 草稿（ver=1），再 SUBMIT（ver=0）。
    // 两个 handler 用同一 symbol 推导出同一草稿 id，SUBMIT 复用 CONFIRM 的
    // id——换 id 会报 "Can not submit while prices are not available!"。
    await this.confirmOrder(request);
    return this.submitOrder(request);
  }

  workingOrders(accountNumber: string): AsyncIterable<ParsedPayloadResponse> {
    // 改查表派发（此前 new 局部 handler，风格分裂；handler 类
    // 无状态，两种写法运行时等价）。
    return this.dispatchHandler(
      WorkingOrdersMessageHandler,
      accountNumber,
    ).iterable();
  }

  /**
   * order_events 原始事件流：body.orders[] 为 wire 原样事件
   * （RawOrderEvent[]，patch 已在 dataStore 合并进 snapshot 基底）。
   * 需要稳定状态枚举用 observeOrders()。
   */
  orderEvents(
    request: OrderEventsRequestParams,
  ): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatchHandler(OrderEventsMessageHandler, request).iterable();
  }

  /**
   * 归一化订单事件流：每条 order_events 响应里的 orders[]
   * 逐条 normalizeOrderEvent 展平（一个 snapshot 可能携带多条事件）。
   * status 归一化取值与映射依据见 NormalizedOrderStatus 注释。
   */
  async *observeOrders(account: string): AsyncIterable<NormalizedOrderEvent> {
    for await (const response of this.orderEvents({ account })) {
      const orders = (response.body as { orders?: RawOrderEvent[] })?.orders;
      if (!orders) continue;
      for (const raw of orders) {
        yield normalizeOrderEvent(raw);
      }
    }
  }

  createAlert(
    request: CreateAlertRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(CreateAlertMessageHandler, request);
  }

  cancelAlert(alertId: number): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(CancelAlertMessageHandler, alertId);
  }

  cancelOrder(orderId: number): Promise<ParsedPayloadResponse> {
    // 撤单无账户/金额上下文：闸门仅做会话级 paperOnly 校验（guard.ts）。
    if (this.guard) {
      try {
        this.guard.validateCancel("cancelOrder");
      } catch (e) {
        return Promise.reject(e as Error);
      }
    }
    return this.dispatchOneShot(CancelOrderMessageHandler, orderId);
  }

  watchlist(watchlistId: number): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(GetWatchlistMessageHandler, watchlistId);
  }

  // ---- 账户域（TECHNICAL.md 实测背书）----
  // Promise 型门面统一取首个 snapshot；error 帧经 dispatch 自动 reject。

  getAccounts(): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(AccountsMessageHandler, undefined);
  }

  getStatement(account: string): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(StatementMessageHandler, account);
  }

  getPositions(accountNumber: string): AsyncIterable<ParsedPayloadResponse> {
    return this.accountPositions(accountNumber);
  }

  getMarginCalls(): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(MarginCallsMessageHandler, undefined);
  }

  getMarketHours(
    request: MarketHoursRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(MarketHoursMessageHandler, request);
  }

  getDisclosures(): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(DisclosuresMessageHandler, undefined);
  }

  getMessageCenter(): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(MessageCenterGetMessageHandler, undefined);
  }

  subscribeMessageCenter(): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatchHandler(
      MessageCenterSubscribeMessageHandler,
      undefined,
    ).iterable();
  }

  // ---- 交易域（scripts/probe-write.mjs W 组实测）----

  confirmOrder(
    draft: PlaceLimitOrderRequestParams,
  ): Promise<ParsedPayloadResponse> {
    // W1：CONFIRM ver=1，id=update-draft-order-<SYMBOL>，返回草稿 snapshot。
    // reclaimStore:false——这份 ver:1 snapshot 是后续 SUBMIT
    // ver:0 patch 的合并基底（同一逻辑文档），confirm settle 时就删会让
    // SUBMIT 失去基底；基底由 submitOrder 的 one-shot settle 统一回收
    // （只 CONFIRM 不 SUBMIT 时滞留至 disconnect/endBuffer 全量兜底）。
    const rejected = this.checkOrderGuard("confirmOrder", draft);
    if (rejected) return rejected;
    return this.dispatchOneShot(PlaceOrderMessageHandler, draft, {
      reclaimStore: false,
    });
  }

  submitOrder(
    draft: SubmitDraftOrderRequestParams,
  ): Promise<ParsedPayloadResponse> {
    // W2：SUBMIT ver=0，复用 confirmOrder 的草稿 id（两个 handler 的
    // header.id 由同一个 symbol 推导，天然一致）。换 id 报
    // "Can not submit while prices are not available!"。
    //
    // 现走统一解析管道（原始帧拦截双轨已删除）：完成帧是 ver:0
    // 的 patch，GenericIncomingMessageHandler 按 service+id 跨 ver 命中
    // ver:1 草稿基底，合并后 body.orders[0].orderId 即新订单号。完成帧
    // 之前可能先到 ver:1 的价格 patch（服务端异步注入），isFinal 用
    // orderId>0 区分终态帧与中间帧；error 帧经 responseObservable 直接
    // reject（WebSocketApiError），无需在此处理。
    const rejected = this.checkOrderGuard("submitOrder", draft);
    if (rejected) return rejected;
    return this.dispatchOneShot(SubmitOrderMessageHandler, draft, {
      isFinal: (msg) => extractOrderId(msg) !== undefined,
    }).then((merged) => {
      // 门面契约（README / smoke-order / mock 依赖）：body.orderId 顶层可见。
      // 合并后的完整草稿文档一并保留（confirmation 块已被完成帧 remove）。
      const orderId = extractOrderId(merged);
      return {
        service: merged.service,
        id: merged.id,
        body: { ...(merged.body ?? {}), orderId },
      };
    });
  }

  replaceOrder(
    request: ReplaceOrderRequestParams,
  ): Promise<ParsedPayloadResponse> {
    // 改单（W3）：EDIT_ORDER + refOrderId，id 用 edit-order-<SYMBOL>。
    // 复用 SubmitOrderMessageHandler——refOrderId 存在时它走改单分支。
    const rejected = this.checkOrderGuard("replaceOrder", request);
    if (rejected) return rejected;
    return this.dispatchOneShot(SubmitOrderMessageHandler, request);
  }

  /**
   * 交易闸门统一入口：命中 GuardError 时返回 **已 reject 的
   * Promise**（而非同步抛出）——写操作返回 Promise 的门面方法以 rejection
   * 报告失败，await 调用方拿到的语义一致，也不会让闸门命中绕过
   * `.catch`/`.then(_, onReject)` 风格调用点。未配置 guard 或校验通过
   * 返回 undefined。
   */
  private checkOrderGuard(
    op: string,
    order: GuardOrderCheck,
  ): Promise<ParsedPayloadResponse> | undefined {
    if (!this.guard) return undefined;
    try {
      this.guard.validateOrder(op, order);
      return undefined;
    } catch (e) {
      return Promise.reject(e as Error);
    }
  }

  // ---- 自选列表（scripts/probe-write.mjs W5 系列实测）----

  getWatchlists(
    request: WatchlistCategoriesRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(WatchlistCategoriesMessageHandler, request);
  }

  createWatchlist(
    request: WatchlistCreateRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(WatchlistCreateMessageHandler, request);
  }

  renameWatchlist(
    request: WatchlistRenameRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(WatchlistRenameMessageHandler, request);
  }

  deleteWatchlist(watchlistId: number): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(WatchlistDeleteMessageHandler, watchlistId);
  }

  addToWatchlist(
    watchlistId: number,
    symbols: string[],
  ): Promise<ParsedPayloadResponse> {
    // 服务端忽略已存在的符号，响应返回合并后列表（W5f）。
    return this.dispatchOneShot(WatchlistAddMessageHandler, {
      watchlistId,
      symbols,
    });
  }

  removeFromWatchlist(
    watchlistId: number,
    symbols: string[],
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(WatchlistRemoveMessageHandler, {
      watchlistId,
      symbols,
    });
  }

  rearrangeWatchlist(
    watchlistId: number,
    symbols: string[],
  ): Promise<ParsedPayloadResponse> {
    // symbols 为新顺序；生效验证走 watchlist/get（W5f 实测）。
    return this.dispatchOneShot(WatchlistRearrangeMessageHandler, {
      watchlistId,
      symbols,
    });
  }

  userProperties(): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(UserPropertiesMessageHandler, null as never);
  }

  // ---- 扩展服务门面----
  // Promise 型走 dispatchOneShot（断线 reject 不重放）；推送流走 dispatchHandler
  // （注册进 activeRequests，重连后原样重放）。

  getStudyCategories(): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(StudyCategoriesMessageHandler, undefined);
  }

  subscribeStudies(
    request: StudySubscribeRequestParams,
  ): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatchHandler(
      StudySubscribeMessageHandler,
      request,
    ).iterable();
  }

  getScanFilters(
    request?: ScanFilterGetRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(ScanFilterGetMessageHandler, request);
  }

  getScanFilterParameters(
    request: ScanFilterParametersRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(ScanFilterParametersMessageHandler, request);
  }

  getScanQuery(
    request: ScanQueryGetRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(ScanQueryGetMessageHandler, request);
  }

  saveScanQuery(
    request: ScanQuerySaveRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(ScanQuerySaveMessageHandler, request);
  }

  getQuotes(request: QuotesGetRequestParams): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(QuotesGetMessageHandler, request);
  }

  getFundamentalsHistory(
    request: FundamentalsHistoryRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(FundamentalsHistoryMessageHandler, request);
  }

  getAccessToken(
    request: AccessTokenGetRequestParams,
  ): Promise<ParsedPayloadResponse> {
    // token 续期（wsjson 通道）：refreshToken → 新 accessToken。
    return this.dispatchOneShot(AccessTokenGetMessageHandler, request);
  }

  getAuthCode(
    request: AuthCodeGetRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(AuthCodeGetMessageHandler, request);
  }

  getAnalystReportsToken(): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(AnalystReportsTokenMessageHandler, undefined);
  }

  createDrawing(
    request: DrawingCreateRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(DrawingCreateMessageHandler, request);
  }

  updateDrawing(
    request: DrawingUpdateRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(DrawingUpdateMessageHandler, request);
  }

  deleteDrawing(
    request: DrawingDeleteRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(DrawingDeleteMessageHandler, request);
  }

  createDrawingSet(
    request: DrawingSetCreateRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(DrawingSetCreateMessageHandler, request);
  }

  deleteDrawingSet(
    request: DrawingSetDeleteRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(DrawingSetDeleteMessageHandler, request);
  }

  getDrawingSets(
    request: DrawingSetsRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(DrawingSetsMessageHandler, request);
  }

  getDrawings(request: DrawingsRequestParams): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(DrawingsMessageHandler, request);
  }

  getRelevantNews(
    request: NewsHeadersGetRelevantRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(NewsHeadersGetRelevantMessageHandler, request);
  }

  subscribeNews(
    request: NewsHeadersSubscribeRequestParams,
  ): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatchHandler(
      NewsHeadersSubscribeMessageHandler,
      request,
    ).iterable();
  }

  subscribeRelevantNews(
    request: NewsHeadersSubscribeRelevantRequestParams,
  ): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatchHandler(
      NewsHeadersSubscribeRelevantMessageHandler,
      request,
    ).iterable();
  }

  newsBody(request: NewsBodyRequestParams): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(NewsBodyMessageHandler, request);
  }

  createChat(request: ChatCreateRequestParams): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(ChatCreateMessageHandler, request);
  }

  closeChat(request: ChatCloseRequestParams): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(ChatCloseMessageHandler, request);
  }

  sendChatMessage(
    request: ChatSendMessageRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(ChatSendMessageMessageHandler, request);
  }

  getSupportChatMessages(
    request: SupportChatMessagesRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(SupportChatMessagesMessageHandler, request);
  }

  updateTaxLot(
    request: TaxLotUpdateRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(TaxLotUpdateMessageHandler, request);
  }

  unsubscribe(
    request: UnsubscribeRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(UnsubscribeMessageHandler, request);
  }

  /**
   * ⚠️ 危险：重置模拟盘余额（破坏性资金操作）。见 WsJsonClient 接口注释。
   */
  demoAccountSetBalance(
    request: DemoAccountSetBalanceRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(DemoAccountSetBalanceMessageHandler, request);
  }

  /**
   * ⚠️ 危险：模拟盘现金划转（破坏性资金操作）。见 WsJsonClient 接口注释。
   */
  demoAccountAdjustCash(
    request: DemoAccountAdjustCashRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(DemoAccountAdjustCashMessageHandler, request);
  }

  /**
   * ⚠️ 危险：终止服务端 Schwab 会话，调用后当前 accessToken 失效。
   */
  logoff(request: LogoffSchwabRequestParams): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(LogoffSchwabMessageHandler, request);
  }

  marketDepth(symbol: string): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatchHandler(MarketDepthMessageHandler, symbol).iterable();
  }

  // ---- 补充服务门面----
  // Promise 型走 dispatchOneShot；持续推送流走 dispatchHandler（重放语义
  // 同扩展服务）。options_statistics 为 snapshot+patch 流（线上实测），
  // 按契约以 AsyncIterable 消费。

  /** news_headers/get：新闻标题（单次 snapshot，实测参数 [symbol, limit]） */
  getNews(
    request: NewsHeadersGetRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(NewsHeadersGetMessageHandler, request);
  }

  /** fundamentals/current：当前基本面指标（fields/time 必传，服务端校验） */
  getFundamentals(
    request: FundamentalsCurrentRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(FundamentalsCurrentMessageHandler, request);
  }

  /** studies/get：研究指标元数据（studies 必须是非空真实研究名） */
  getStudies(request: StudiesGetRequestParams): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(StudiesGetMessageHandler, request);
  }

  /** options_statistics：期权链统计 snapshot+patch 推送流（线上实测） */
  subscribeOptionsStatistics(
    request: OptionsStatisticsRequestParams,
  ): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatchHandler(
      OptionsStatisticsMessageHandler,
      request,
    ).iterable();
  }

  /** order_history：订单历史（epoch 秒、窗口 ≤370 天、account 用真实 code） */
  getOrderHistory(
    request: OrderHistoryRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(OrderHistoryMessageHandler, request);
  }

  /** tax_lot/get：税则批次查询（guest 被服务端拒绝，真实账户待测） */
  getTaxLots(request: TaxLotGetRequestParams): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(TaxLotGetMessageHandler, request);
  }

  /** transactions/categories：交易分类目录（guest 校验错误，真实账户待测） */
  getTransactionCategories(
    request: TransactionsCategoriesRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(TransactionsCategoriesMessageHandler, request);
  }

  /**
   * chat_global/messages：交易台 chat 全局公告/服务时间。
   * 契约（TECHNICAL.md）定为 AsyncIterable：首帧 snapshot，公告/开关
   * 变更由服务端推送更新（probe 观察窗内仅一帧 snapshot）。
   */
  subscribeGlobalChats(): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatchHandler(
      ChatGlobalMessagesMessageHandler,
      undefined,
    ).iterable();
  }

  /** support_chats：客服 chat 会话列表（单次 snapshot，guest 实测空 body） */
  getSupportChats(): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(SupportChatsMessageHandler, undefined);
  }

  /**
   * ⚠️ user_properties/set：写用户属性（写操作）。参数形状未实测确认
   * （guest 空对象也回 snapshot {}），谨慎使用。
   */
  setUserProperties(
    request: UserPropertiesSetRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(UserPropertiesSetMessageHandler, request);
  }

  /**
   * ⚠️ disclosures/accept：接受披露协议（写操作，disclosureIds 非空）。
   * guest 无可接受披露，成功形状未实测。
   */
  acceptDisclosures(
    request: DisclosuresAcceptRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(DisclosuresAcceptMessageHandler, request);
  }

  private dispatch<Req>(
    handler: WebSocketApiMessageHandler<Req>,
    args: Req,
  ): SubscriptionStream<NonNullable<ParsedPayloadResponse>> {
    this.ensureConnected();
    const request = handler.buildRequest(args);
    // Correlate responses with this request using the header echoed by the
    // server: the request's service name plus its id. Using the service name
    // from the built request (instead of `handler.service`) keeps routing
    // correct even when a handler declares a service name that differs from
    // the one it actually sends.
    const { service: requestService, id: requestId } =
      request.payload?.[0]?.header ?? {};
    this.sendMessage(request);
    // 流式订阅登记：重连成功并重新 login 后原样重发（见 replayActiveRequests）
    if (requestService && requestId) {
      this.activeRequests.set(`${requestService}$${requestId}`, request);
    }
    const observable = this.responseObservable(requestService, requestId);
    // 流式订阅的资源回收挂到消费者提前退出路径上——
    // SubscriptionStream 的 return()/throw()（for-await 的 break / 抛异常）
    // 经 releaseSubscription 清 dataStore 基底、注销重放登记并 best-effort
    // 发 unsubscribe。服务端正常终止（buffer.end）不走这里，由 endBuffer
    // 路径统一清全部。
    return new SubscriptionStream(observable, () =>
      this.releaseSubscription(requestService, requestId),
    );
  }

  /**
   * 一次性（promise 型）请求。与流式 dispatch 的关键区别：断开时等待者被
   * reject（TransportError），重连后 **不** 重放——重发写操作的后果由调用
   * 方承担是不可接受的，重试是调用方的责任。
   *
   * 扩展（SUBMIT 走统一管道所需，其余调用方行为不变）：
   * - `reclaimStore: false`：settle 时不回收 dataStore 基底。place_order 的
   *   CONFIRM snapshot（ver:1）是后续 SUBMIT patch（ver:0 同 id）的合并基底，
   *   confirmOrder 的 one-shot 先于 SUBMIT 完成帧 settle，默认回收会让 patch
   *   失去基底——改由 SUBMIT one-shot settle 时统一回收（每草稿 id 至多一条
   *   基底，泄漏面有界；disconnect/endBuffer 全量兜底）。
   * - `isFinal`：从匹配条目中挑出终态响应，缺省仍是「首个匹配条目即终态」。
   *   SUBMIT 的完成帧之前可能先收到草稿的价格 patch（ver:1，服务端异步注入），
   *   这些中间条目被跳过（其 body 已合并进 store，无需透出）。error 条目在
   *   responseObservable 层直接抛 WebSocketApiError，不受 isFinal 影响。
   */
  private dispatchOneShot<Req>(
    handlerCtor: Constructor<WebSocketApiMessageHandler<Req>>,
    args: Req,
    options: {
      reclaimStore?: boolean;
      isFinal?: (msg: ParsedPayloadResponse) => boolean;
    } = {},
  ): Promise<ParsedPayloadResponse> {
    const handler = findByTypeOrThrow(messageHandlers, handlerCtor);
    this.ensureConnected();
    const request = handler.buildRequest(args);
    const { service: requestService, id: requestId } =
      request.payload?.[0]?.header ?? {};
    return new Promise<ParsedPayloadResponse>((resolve, reject) => {
      const key =
        requestService && requestId
          ? `${requestService}$${requestId}`
          : undefined;
      if (key) {
        this.pendingOneShots.set(key, (err) => reject(err));
      }
      this.sendMessage(request);
      const observable = this.responseObservable(requestService, requestId);
      const pending = options.isFinal
        ? observable.filter(options.isFinal).promise()
        : observable.promise();
      const reclaim = (): void => {
        // 一次性请求到达终态，store 条目（若有 patch 基底）resolve 后
        // 立即回收；one-shot 不入 activeRequests，无需发 unsubscribe
        // （服务端一次性订阅自终止）。reclaimStore:false 时由后续步骤
        // （SUBMIT one-shot）或全量路径回收。
        if (options.reclaimStore !== false && requestService && requestId) {
          this.responseParser.removeStore(requestService, requestId);
        }
      };
      pending.then(
        (value) => {
          if (key) this.pendingOneShots.delete(key);
          reclaim();
          resolve(value);
        },
        (err) => {
          if (key) this.pendingOneShots.delete(key);
          reclaim();
          reject(err);
        },
      );
    });
  }

  /** 按 service+id 过滤已解析流的公共逻辑（error 条目抛 WebSocketApiError） */
  private responseObservable(
    requestService: string | undefined,
    requestId: string | undefined,
  ): Observable<NonNullable<ParsedPayloadResponse>> {
    return deferredWrap(() => this.iterator).filter((msg) => {
      if (!isResponseForRequest(msg, requestService, requestId)) {
        return false;
      }
      if (msg.error) {
        // header.type === "error" entry: reject the promise (or terminate
        // the iterable) waiting on this request instead of emitting it.
        throw new WebSocketApiError(msg.error.message, {
          service: msg.service,
          requestId: msg.id,
          isTerminal: msg.error.isTerminal,
        });
      }
      return true;
    }) as Observable<NonNullable<ParsedPayloadResponse>>;
  }

  /**
   * 流式订阅的资源回收：消费者提前退出（for-await 的
   * break/throw 触发 SubscriptionStream.return()/throw()）时调用。
   * 1) 删 GenericIncomingMessageHandler.dataStore 里该订阅的补丁基底
   *    （否则长连接下 quotes/chart 等高频 patch 的基底永久驻留，内存只涨不降）；
   * 2) 注销 activeRequests 重放登记（否则重连后会重放无人认领的订阅）；
   * 3) best-effort 向服务端发 unsubscribe（options.autoUnsubscribe，默认开）：
   *    发出即返回、不等响应——服务端对已不存在的订阅回 "No subscription"
   *    error 属正常，经 .catch 静默；发送路径的任何异常也吞掉，绝不影响
   *    消费者侧 return/throw 的语义。走 dispatchOneShot 而非裸 sendMessage
   *    是为了让 unsubscribe 应答自身的 store 条目也在一-shot settle 时被回收。
   */
  private releaseSubscription(
    service: string | undefined,
    id: string | undefined,
  ): void {
    if (!service || !id) return;
    this.responseParser.removeStore(service, id);
    this.activeRequests.delete(`${service}$${id}`);
    if (!this.autoUnsubscribe || !this.isConnected()) return;
    try {
      this.dispatchOneShot(UnsubscribeMessageHandler, {
        targetService: service,
        targetRequestId: id,
      }).catch(() => undefined);
    } catch (e) {
      // best-effort：unsubscribe 发送失败不影响本地回收已完成的事实
      debugLog("best-effort unsubscribe failed for %s$%s: %s", service, id, e);
    }
  }

  private sendMessage(data: any) {
    logger("➡️\tsending %O", data);
    const msg = JSON.stringify(data);
    this.socket?.send(msg);
  }

  private handleSchwabLoginResponse(message: RawLoginResponse) {
    const handler = findByTypeOrThrow(
      messageHandlers,
      SchwabLoginMessageHandler,
    );
    const loginResponse = handler.parseResponse(message as RawPayloadResponse);
    const [{ body }] = message.payload;
    if (loginResponse.authenticated) {
      logger("Schwab login successful, token=%s", body.token);
      this.credentials.accessToken = body.token;
      if (loginResponse.refreshToken) {
        this.credentials.refreshToken = loginResponse.refreshToken;
      }
      this.credentials.obtainedAt = Date.now();
      // 登录响应轮换过 token：同步进续期器，避免它拿过期/作废的旧值刷新
      this.authenticator?.updateTokens({
        accessToken: body.token,
        refreshToken: loginResponse.refreshToken,
      });
      this.onLoginSuccess(body);
    } else {
      this.handleLoginFailure(body);
    }
  }

  private handleLoginResponse(message: RawLoginResponse) {
    const handler = findByTypeOrThrow(messageHandlers, LoginMessageHandler);
    const loginResponse = handler.parseResponse(message as RawPayloadResponse);
    const [{ body }] = message.payload;
    if (loginResponse.successful) {
      this.onLoginSuccess(body);
    } else {
      this.handleLoginFailure(body);
    }
  }

  /**
   * 登录失败（R6：AuthError 替代旧的字符串 reject）。首轮认证：置 ERROR、
   * 关闭连接、终结流（与旧行为一致，凭据错误不自动重试）。重连尝试中：
   * 按退避继续重试——token 可能只是暂时失效。
   */
  private handleLoginFailure(body: { message?: string }) {
    this.clearHandshakeTimer();
    this.clearHeartbeat();
    const err = new AuthError(`Login failed: ${body.message}`);
    const wasReconnectAttempt = this.pendingReplayAfterLogin;
    this.pendingReplayAfterLogin = false;
    const handshake = this.pendingHandshake;
    this.pendingHandshake = undefined;
    // 先摘掉 this.socket 再 close：close 事件被身份守卫忽略，
    // 避免走自动重连路径（此处自行决策重试策略）。
    const socket = this.socket;
    this.socket = undefined;
    this.state = ChannelState.ERROR;
    handshake?.reject(err);
    socket?.close();
    if (wasReconnectAttempt) {
      this.scheduleReconnect();
      return;
    }
    this.failReconnectPromise(err);
    this.drainOneShots(err.message);
    if (!this.bufferEnded) this.endBuffer();
  }

  private dispatchHandler<Req>(
    handlerCtor: Constructor<WebSocketApiMessageHandler<Req>>,
    arg: Req,
  ): SubscriptionStream<NonNullable<ParsedPayloadResponse>> {
    const handler = findByTypeOrThrow(messageHandlers, handlerCtor);
    return this.dispatch(handler, arg);
  }

  disconnect() {
    this.explicitDisconnect = true;
    this.clearReconnectTimer();
    this.clearHeartbeat();
    this.clearHandshakeTimer();
    this.pendingReplayAfterLogin = false;
    // 显式断开后不再重连，旧订阅的消费者已随 buffer.end() 退出；
    // 清空登记表，避免 reconnect() 向新会话重放无人认领的请求。
    this.activeRequests.clear();
    // 显式断开 = 服务端整个会话销毁，逐个发 unsubscribe 无意义；
    // 直接清空本地 dataStore 的全部补丁基底（TECHNICAL.md 内存增长项）。
    this.responseParser.clearStores();
    const socket = this.socket;
    this.socket = undefined;
    this.state = ChannelState.DISCONNECTED;
    // 先摘 socket 再 close：close 事件被身份守卫忽略，收尾在此统一做
    socket?.close();
    // 等待响应的一次性请求不应悬挂（SUBMIT 完成帧走通用一次性
    // 管道，旧 pendingSubmissions 专用排空已随之删除）——显式断开同样 reject。
    this.drainOneShots("explicit disconnect");
    this.failReconnectPromise(
      new TransportError("Disconnected while reconnecting"),
    );
    if (!this.bufferEnded) this.endBuffer();
  }
}
