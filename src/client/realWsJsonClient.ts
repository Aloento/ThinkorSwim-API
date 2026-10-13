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
import WatchlistCategoriesMessageHandler, {
  WatchlistCategoriesRequestParams,
} from "./services/watchlistCategoriesMessageHandler.js";
import WatchlistCreateMessageHandler, {
  WatchlistCreateRequestParams,
} from "./services/watchlistCreateMessageHandler.js";
import WatchlistDeleteMessageHandler from "./services/watchlistDeleteMessageHandler.js";
import WatchlistRenameMessageHandler, {
  WatchlistRenameRequestParams,
} from "./services/watchlistRenameMessageHandler.js";
import WebSocketApiMessageHandler from "./services/webSocketApiMessageHandler.js";
import WorkingOrdersMessageHandler from "./services/workingOrdersMessageHandler.js";
import {
  ParsedPayloadResponse,
  RawPayloadResponse,
  RESPONSE_TYPE,
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
    private readonly socket = new WebSocket(options.wsUrl ?? DEFAULT_WS_URL, {
      headers: {
        Pragma: "no-cache",
        Origin: "https://trade.thinkorswim.com",
        Upgrade: "websocket",
        "Cache-Control": "no-cache",
        Connection: "Upgrade",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Extensions":
          "permessage-deflate; client_max_window_bits",
        ...(options.cookie ? { Cookie: options.cookie } : {}),
        "User-Agent":
          options.userAgent ??
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
      },
    }),
    private readonly responseParser = new ResponseParser(this.genericHandler),
  ) {}

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
    const { state } = this;
    switch (state) {
      case ChannelState.DISCONNECTED:
        this.buffer = new BufferedIterator<ParsedPayloadResponse>();
        this.iterator = new MulticastIterator(this.buffer);
        this.state = ChannelState.CONNECTING;
        return await this.doConnect();
      case ChannelState.CONNECTING: // no-op
        return Promise.reject("Already connecting");
      case ChannelState.CONNECTED: // no-op
        return Promise.reject("Already connected");
      case ChannelState.ERROR:
        return Promise.reject("Illegal state, ws connection failed previously");
    }
  }
  private doConnect(): Promise<RawLoginResponseBody> {
    const { socket } = this;
    return new Promise((resolve, reject) => {
      if (socket.readyState === WebSocket.OPEN) {
        this.sendMessage(CONNECTION_REQUEST_MESSAGE);
      }
      socket.onopen = () => this.sendMessage(CONNECTION_REQUEST_MESSAGE);
      socket.onclose = (event) =>
        debugLog("connection closed: ", event?.reason);
      socket.onmessage = ({ data }) =>
        this.onMessage(data as string, resolve, reject);
    });
  }

  private onMessage(
    data: string,
    resolve: (value: RawLoginResponseBody) => void,
    reject: (reason?: string) => void,
  ) {
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
      } else if (isLoginResponse(message)) {
        this.handleLoginResponse(message, resolve, reject);
      } else if (isSchwabLoginResponse(message)) {
        this.handleSchwabLoginResponse(message, resolve, reject);
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
      throwError("no credentials provided, cannot authenticate");
    }
  }

  isConnected(): boolean {
    const { socket, state } = this;
    return socket !== null && state === ChannelState.CONNECTED;
  }

  isConnecting(): boolean {
    const { socket, state } = this;
    return socket !== null && state === ChannelState.CONNECTING;
  }

  ensureConnected() {
    if (this.state !== ChannelState.CONNECTED) {
      throw new Error("Please call connect() first");
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
    return this.dispatchHandler(InstrumentSearchMessageHandler, {
      query,
    }).promise();
  }

  lookupAlerts(): AsyncIterable<ParsedPayloadResponse> {
    return this.dispatchHandler(
      AlertLookupMessageHandler,
      null as never,
    ).iterable();
  }

  optionChain(symbol: string): Promise<ParsedPayloadResponse> {
    return this.dispatchHandler(OptionSeriesMessageHandler, symbol).promise();
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
    return this.dispatchHandler(
      OptionChainDetailsMessageHandler,
      request,
    ).promise();
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
    return this.dispatchHandler(CreateAlertMessageHandler, request).promise();
  }

  cancelAlert(alertId: number): Promise<ParsedPayloadResponse> {
    return this.dispatchHandler(CancelAlertMessageHandler, alertId).promise();
  }

  cancelOrder(orderId: number): Promise<ParsedPayloadResponse> {
    return this.dispatchHandler(CancelOrderMessageHandler, orderId).promise();
  }

  watchlist(watchlistId: number): Promise<ParsedPayloadResponse> {
    return this.dispatchHandler(
      GetWatchlistMessageHandler,
      watchlistId,
    ).promise();
  }

  // ---- 账户域（agent/07，probe-2026-10-13 实测背书）----
  // Promise 型门面统一取首个 snapshot；error 帧经 dispatch 自动 reject。

  getAccounts(): Promise<ParsedPayloadResponse> {
    return this.dispatchHandler(AccountsMessageHandler, undefined).promise();
  }

  getStatement(account: string): Promise<ParsedPayloadResponse> {
    return this.dispatchHandler(StatementMessageHandler, account).promise();
  }

  getPositions(accountNumber: string): AsyncIterable<ParsedPayloadResponse> {
    return this.accountPositions(accountNumber);
  }

  getMarginCalls(): Promise<ParsedPayloadResponse> {
    return this.dispatchHandler(MarginCallsMessageHandler, undefined).promise();
  }

  getMarketHours(
    request: MarketHoursRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchHandler(MarketHoursMessageHandler, request).promise();
  }

  getDisclosures(): Promise<ParsedPayloadResponse> {
    return this.dispatchHandler(DisclosuresMessageHandler, undefined).promise();
  }

  getMessageCenter(): Promise<ParsedPayloadResponse> {
    return this.dispatchHandler(
      MessageCenterGetMessageHandler,
      undefined,
    ).promise();
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
    return this.dispatchHandler(PlaceOrderMessageHandler, draft).promise();
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
    return this.dispatchHandler(SubmitOrderMessageHandler, request).promise();
  }

  // ---- 自选列表（write-2026-10-13 W5 系列实测）----

  getWatchlists(
    request: WatchlistCategoriesRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchHandler(
      WatchlistCategoriesMessageHandler,
      request,
    ).promise();
  }

  createWatchlist(
    request: WatchlistCreateRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchHandler(
      WatchlistCreateMessageHandler,
      request,
    ).promise();
  }

  renameWatchlist(
    request: WatchlistRenameRequestParams,
  ): Promise<ParsedPayloadResponse> {
    return this.dispatchHandler(
      WatchlistRenameMessageHandler,
      request,
    ).promise();
  }

  deleteWatchlist(watchlistId: number): Promise<ParsedPayloadResponse> {
    return this.dispatchHandler(
      WatchlistDeleteMessageHandler,
      watchlistId,
    ).promise();
  }

  userProperties(): Promise<ParsedPayloadResponse> {
    return this.dispatchHandler(
      UserPropertiesMessageHandler,
      null as never,
    ).promise();
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
    this.sendMessage(request);
    // Correlate responses with this request using the header echoed by the
    // server: the request's service name plus its id. Using the service name
    // from the built request (instead of `handler.service`) keeps routing
    // correct even when a handler declares a service name that differs from
    // the one it actually sends.
    const { service: requestService, id: requestId } =
      request.payload?.[0]?.header ?? {};
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

  private handleSchwabLoginResponse(
    message: RawLoginResponse,
    resolve: (value: RawLoginResponseBody) => void,
    reject: (reason?: string) => void,
  ) {
    const handler = findByTypeOrThrow(
      messageHandlers,
      SchwabLoginMessageHandler,
    );
    const loginResponse = handler.parseResponse(message as RawPayloadResponse);
    const [{ body }] = message.payload;
    if (loginResponse.authenticated) {
      this.state = ChannelState.CONNECTED;
      logger("Schwab login successful, token=%s", body.token);
      this.credentials.accessToken = body.token;
      if (loginResponse.refreshToken) {
        this.credentials.refreshToken = loginResponse.refreshToken;
      }
      resolve(body);
    } else {
      this.state = ChannelState.ERROR;
      reject(`Login failed: ${body.message}`);
      this.disconnect();
    }
  }

  private handleLoginResponse(
    message: RawLoginResponse,
    resolve: (value: RawLoginResponseBody) => void,
    reject: (reason?: string) => void,
  ) {
    const handler = findByTypeOrThrow(messageHandlers, LoginMessageHandler);
    const loginResponse = handler.parseResponse(message as RawPayloadResponse);
    const [{ body }] = message.payload;
    if (loginResponse.successful) {
      this.state = ChannelState.CONNECTED;
      resolve(body);
    } else {
      this.state = ChannelState.ERROR;
      reject(`Login failed: ${body.message}`);
      this.disconnect();
    }
  }

  private dispatchHandler<Req>(
    handlerCtor: Constructor<WebSocketApiMessageHandler<Req>>,
    arg: Req,
  ): Observable<NonNullable<ParsedPayloadResponse>> {
    const handler = findByTypeOrThrow(messageHandlers, handlerCtor);
    return this.dispatch(handler, arg);
  }

  disconnect() {
    this.socket?.close();
    this.state = ChannelState.DISCONNECTED;
    // 等待 SUBMIT 完成帧的调用方不应悬挂——连接断开时全部 reject。
    for (const [key, waiter] of this.pendingSubmissions) {
      this.pendingSubmissions.delete(key);
      waiter.reject(
        new Error("Connection closed before order submission completed."),
      );
    }
    // This ensures that listeners will resolve the promise cleanly from any `for await` loops
    this.buffer.end();
  }
}
