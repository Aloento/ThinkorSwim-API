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
import OrderEventsMessageHandler from "./services/orderEventsMessageHandler.js";
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
import SubscribeToAlertMessageHandler from "./services/subscribeToAlertMessageHandler.js";
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
import {
  AuthError,
  ParsedPayloadResponse,
  RawPayloadRequest,
  RawPayloadResponse,
  RESPONSE_TYPE,
  TransportError,
  WebSocketApiError,
  WsJsonRawMessage,
} from "./tdaWsJsonTypes.js";
import {
  Constructor,
  debugLog,
  ensure,
  findByTypeOrThrow,
  throwError,
} from "./util.js";
import { WsJsonClient } from "./wsJsonClient.js";

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

const messageHandlers: WebSocketApiMessageHandler<never>[] = [
  new CancelAlertMessageHandler(),
  new CreateAlertMessageHandler(),
  new AlertLookupMessageHandler(),
  new SubscribeToAlertMessageHandler(),
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
  } = {};
  private readonly options: RealWsJsonClientOptions;
  private readonly handshakeTimeoutMs: number;
  private readonly heartbeatTimeoutMs: number;
  private readonly reconnectBackoffInitialMs: number;
  private readonly reconnectBackoffMaxMs: number;
  private readonly reconnectJitterRatio: number;
  private readonly autoReconnect: boolean;
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
  /**
   * 等待 SUBMIT 完成帧（orderId patch / error 帧）的 waiter，key 为
   * `<service>$<requestId>`。这些帧必须看原始 header（ver/type），不能走
   * 已解析流（见 submitOrder 注释）。
   */
  private readonly pendingSubmissions = new Map<
    string,
    {
      resolve: (value: ParsedPayloadResponse) => void;
      reject: (reason: unknown) => void;
    }
  >();

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
    this.credentials = { accessToken, refreshToken };
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
    this.drainOneShots(`Connection lost: ${reason}`);
    // 等待 SUBMIT 完成帧的调用方不应悬挂——同样 reject（Error 化）。
    this.drainPendingSubmissions(
      new TransportError(
        `Connection closed before order submission completed: ${reason}`,
      ),
    );
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
        // SUBMIT 完成帧（orderId patch / error 帧）由原始拦截消费；
        // 其余（或 payload 里混有其他条目时）走通用解析。
        if (!this.checkPendingSubmissions(message)) {
          const parsedResponse = responseParser.parseResponse(message);
          parsedResponse?.forEach((r) => buffer.emit(r));
        }
      }
    } catch (e) {
      console.warn("⚠️ Failed to process websocket frame, ignoring: ", e);
    }
  }

  private authenticate() {
    const {
      credentials: { authCode, accessToken },
    } = this;
    if (accessToken) {
      // if we already have an access token, we can just authenticate with it
      const handler = findByTypeOrThrow(messageHandlers, LoginMessageHandler);
      this.sendMessage(handler.buildRequest(accessToken));
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

  private drainPendingSubmissions(err: Error) {
    for (const [key, waiter] of this.pendingSubmissions) {
      this.pendingSubmissions.delete(key);
      waiter.reject(err);
    }
  }

  private endBuffer() {
    this.bufferEnded = true;
    // This ensures that listeners will resolve the promise cleanly from any `for await` loops
    this.buffer.end();
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
    const handler = new WorkingOrdersMessageHandler();
    return this.dispatch(handler, accountNumber).iterable();
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
    return this.dispatchOneShot(CancelOrderMessageHandler, orderId);
  }

  watchlist(watchlistId: number): Promise<ParsedPayloadResponse> {
    return this.dispatchOneShot(GetWatchlistMessageHandler, watchlistId);
  }

  // ---- 账户域（agent/07，probe-2026-10-13 实测背书）----
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

  // ---- 交易域（write-2026-10-13 W 组实测）----

  confirmOrder(
    draft: PlaceLimitOrderRequestParams,
  ): Promise<ParsedPayloadResponse> {
    // W1：CONFIRM ver=1，id=update-draft-order-<SYMBOL>，返回草稿 snapshot。
    return this.dispatchOneShot(PlaceOrderMessageHandler, draft);
  }

  submitOrder(
    draft: SubmitDraftOrderRequestParams,
  ): Promise<ParsedPayloadResponse> {
    // W2：SUBMIT ver=0，复用 confirmOrder 的草稿 id（两个 handler 的
    // header.id 由同一个 symbol 推导，天然一致）。换 id 报
    // "Can not submit while prices are not available!"。
    //
    // orderId 只在 SUBMIT 后的 patch（path /orders/0/orderId）里，且该帧
    // ver=0 而 CONFIRM snapshot 存于 ver=1 的 storeKey——当前
    // GenericIncomingMessageHandler 对无 base 的 patch 会丢弃该条目。
    // 因此这里在 onMessage 里直接拦截原始帧（见 checkPendingSubmissions），
    // 不经过已解析流；error 帧同样在此 reject。
    this.ensureConnected();
    const handler = findByTypeOrThrow(
      messageHandlers,
      SubmitOrderMessageHandler,
    );
    const request = handler.buildRequest(draft);
    const { service: requestService, id: requestId } =
      request.payload?.[0]?.header ?? {};
    if (!requestService || !requestId) {
      throwError("submitOrder: handler produced a request without service/id");
    }
    // 同一 symbol 的重复提交会覆盖旧 waiter——服务端草稿本来就是按 id 唯一的。
    return new Promise<ParsedPayloadResponse>((resolve, reject) => {
      this.pendingSubmissions.set(`${requestService}$${requestId}`, {
        resolve,
        reject,
      });
      this.sendMessage(request);
    });
  }

  replaceOrder(
    request: ReplaceOrderRequestParams,
  ): Promise<ParsedPayloadResponse> {
    // 改单（W3）：EDIT_ORDER + refOrderId，id 用 edit-order-<SYMBOL>。
    // 复用 SubmitOrderMessageHandler——refOrderId 存在时它走改单分支。
    return this.dispatchOneShot(SubmitOrderMessageHandler, request);
  }

  // ---- 自选列表（write-2026-10-13 W5 系列实测）----

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

  marketDepth(symbol: string): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatchHandler(MarketDepthMessageHandler, symbol).iterable();
  }

  private dispatch<Req>(
    handler: WebSocketApiMessageHandler<Req>,
    args: Req,
  ): Observable<NonNullable<ParsedPayloadResponse>> {
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
    return this.responseObservable(requestService, requestId);
  }

  /**
   * 一次性（promise 型）请求。与流式 dispatch 的关键区别：断开时等待者被
   * reject（TransportError），重连后 **不** 重放——重发写操作的后果由调用
   * 方承担是不可接受的，重试是调用方的责任。
   */
  private dispatchOneShot<Req>(
    handlerCtor: Constructor<WebSocketApiMessageHandler<Req>>,
    args: Req,
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
      this.responseObservable(requestService, requestId)
        .promise()
        .then(
          (value) => {
            if (key) this.pendingOneShots.delete(key);
            resolve(value);
          },
          (err) => {
            if (key) this.pendingOneShots.delete(key);
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
   * SUBMIT 完成帧的原始拦截（见 submitOrder）。返回 true 表示整个 payload
   * 已被消费，不必再进通用解析（ver=0 的 patch 在通用解析里因缺少
   * snapshot base 会被丢弃并打出误导性的告警）。
   */
  private checkPendingSubmissions(message: WsJsonRawMessage): boolean {
    if (this.pendingSubmissions.size === 0) return false;
    const payload = (message as RawPayloadResponse).payload;
    if (!Array.isArray(payload) || payload.length === 0) return false;
    let consumedAll = true;
    for (const entry of payload) {
      const header = entry?.header;
      if (!header) return false;
      const key = `${header.service}$${header.id}`;
      const waiter = this.pendingSubmissions.get(key);
      if (!waiter || header.ver !== 0) {
        // 其他订阅者的条目（如 CONFIRM 的 ver=1 帧）走通用解析。
        consumedAll = false;
        continue;
      }
      if (header.type === RESPONSE_TYPE.ERROR) {
        this.pendingSubmissions.delete(key);
        const body = (entry.body ?? {}) as {
          message?: string;
          isTerminal?: boolean;
        };
        waiter.reject(
          new WebSocketApiError(
            body.message ?? `Order submission (id=${header.id}) failed`,
            {
              service: header.service,
              requestId: header.id,
              isTerminal: body.isTerminal,
            },
          ),
        );
      } else if (header.type === RESPONSE_TYPE.PATCH) {
        const patches = (
          entry.body as
            | { patches?: { op: string; path: string; value?: unknown }[] }
            | undefined
        )?.patches;
        const orderIdOp = patches?.find((op) => op.path.endsWith("/orderId"));
        if (orderIdOp && "value" in orderIdOp) {
          // W2 实测：orderId 经 patch /orders/0/orderId 返回。
          this.pendingSubmissions.delete(key);
          waiter.resolve({
            service: header.service,
            id: header.id,
            body: { orderId: orderIdOp.value },
          });
        } else {
          consumedAll = false;
        }
      } else {
        consumedAll = false;
      }
    }
    return consumedAll;
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
    this.drainPendingSubmissions(err);
    if (!this.bufferEnded) this.endBuffer();
  }

  private dispatchHandler<Req>(
    handlerCtor: Constructor<WebSocketApiMessageHandler<Req>>,
    arg: Req,
  ): Observable<NonNullable<ParsedPayloadResponse>> {
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
    const socket = this.socket;
    this.socket = undefined;
    this.state = ChannelState.DISCONNECTED;
    // 先摘 socket 再 close：close 事件被身份守卫忽略，收尾在此统一做
    socket?.close();
    // 等待 SUBMIT 完成帧的调用方不应悬挂——连接断开时全部 reject。
    this.drainPendingSubmissions(
      new TransportError(
        "Connection closed before order submission completed.",
      ),
    );
    this.failReconnectPromise(
      new TransportError("Disconnected while reconnecting"),
    );
    if (!this.bufferEnded) this.endBuffer();
  }
}
