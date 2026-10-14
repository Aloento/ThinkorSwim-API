import ws from "ws";
import debug from "debug";
import {
  ALL_REQUESTS,
  ProxiedRequest,
  ProxiedResponse,
} from "../client/wsJsonClientProxy.js";
import { WsJsonClient } from "../client/wsJsonClient.js";
import { Disposable } from "./disposable.js";

const logger = debug("wsJsonServerProxy");

// 安全：request 白名单——客户端可发任意 JSON，switch 未命中的
// request 此前被静默吞掉（客户端 promise 永挂）。改为显式回错。
const REQUEST_SET: ReadonlySet<string> = new Set<string>(ALL_REQUESTS);

export type WsJsonServerProxyOptions = {
  /**
   * 鉴权：共享 token。设置后每条客户端消息必须携带相同的
   * 顶层 `token` 字段（WsJsonClientProxy 配了 authToken 会自动附带），
   * 不匹配回 `{error:"unauthorized"}` 并断开连接。未设置保持旧行为
   * （无鉴权）——本地代理默认信任本机，生产/多用户机器建议设置。
   */
  authToken?: string;
};

/**
 * Sits in between two WebSocket connections and proxies messages between them. The client `downstream` connection is
 * expected to send ProxiedRequest JSON messages with a "request" property that matches a method on the WsJsonClient interface and an
 * "args" property that is an array of arguments to pass to the method. The response from the `upstream`
 * connection is then forwarded back to the `downstream` as a JSON string.
 */
export default class WsJsonServerProxy implements Disposable {
  private upstream?: WsJsonClient;

  constructor(
    private readonly downstream: ws,
    private readonly wsJsonClientFactory: () => WsJsonClient,
    private readonly options?: WsJsonServerProxyOptions,
  ) {
    downstream.on("error", console.error);
    downstream.on("message", (data: string) => this.onClientMessage(data));
    logger("connected and ready to accept messages");
  }

  disconnect() {
    this.upstream?.disconnect();
    this.downstream.close();
  }

  private onClientMessage = async (data: string) => {
    // 非法 JSON 此前是 unhandled rejection（可让进程崩溃的攻击面），
    // 现在回错并保留连接。
    let msg: ProxiedRequest;
    try {
      msg = JSON.parse(data) as ProxiedRequest;
    } catch {
      this.downstream.send(JSON.stringify({ error: "invalid json" }));
      return;
    }
    logger("⬅️\treceived %O", msg);
    const { request } = msg;
    // S1：token 校验先于一切业务分发；不匹配回错并断开（含上游）。
    if (
      this.options?.authToken !== undefined &&
      msg.token !== this.options.authToken
    ) {
      this.downstream.send(JSON.stringify({ error: "unauthorized" }));
      this.disconnect();
      return;
    }
    // 安全：request 白名单——未知方法回错（保持连接，客户端可继续）。
    if (typeof request !== "string" || !REQUEST_SET.has(request)) {
      this.downstream.send(JSON.stringify({ error: "unknown request" }));
      return;
    }
    switch (request) {
      case "authenticateWithAccessToken":
      case "authenticateWithAuthCode": {
        this.upstream = this.wsJsonClientFactory();
        return await this.relayPromise(msg);
      }
      case "quotes":
      case "accountPositions":
      case "getPositions":
      case "chart":
      case "lookupAlerts":
      case "optionChainQuotes":
      case "optionQuotes":
      case "workingOrders":
      case "marketDepth":
      case "subscribeAlerts":
      case "orderEvents":
      case "observeOrders":
      case "subscribeMessageCenter":
      case "subscribeStudies":
      case "subscribeNews":
      case "subscribeRelevantNews":
      case "subscribeOptionsStatistics":
      case "subscribeGlobalChats":
        return await this.relayIterable(msg);
      // 单参/零参方法 → relayPromise 单参分发；扩展服务方法
      // 全部单对象参数，直接并入本组（双参方法才走 relaySpread）。
      case "createAlert":
      case "cancelAlert":
      case "cancelOrder":
      case "searchInstruments":
      case "userProperties":
      case "watchlist":
      case "optionChain":
      case "optionChainDetails":
      case "replaceOrder":
      case "placeOrder":
      case "confirmOrder":
      case "submitOrder":
      case "getAccounts":
      case "getStatement":
      case "getMarginCalls":
      case "getMarketHours":
      case "getDisclosures":
      case "getMessageCenter":
      case "getWatchlists":
      case "createWatchlist":
      case "renameWatchlist":
      case "deleteWatchlist":
      case "reconnect":
      case "getStudyCategories":
      case "getScanFilters":
      case "getScanFilterParameters":
      case "getScanQuery":
      case "saveScanQuery":
      case "getQuotes":
      case "getFundamentalsHistory":
      case "getAccessToken":
      case "getAuthCode":
      case "getAnalystReportsToken":
      case "createDrawing":
      case "updateDrawing":
      case "deleteDrawing":
      case "createDrawingSet":
      case "deleteDrawingSet":
      case "getDrawingSets":
      case "getDrawings":
      case "getRelevantNews":
      case "newsBody":
      case "createChat":
      case "closeChat":
      case "sendChatMessage":
      case "getSupportChatMessages":
      case "updateTaxLot":
      case "unsubscribe":
      case "demoAccountSetBalance":
      case "demoAccountAdjustCash":
      case "logoff":
      case "getNews":
      case "getFundamentals":
      case "getStudies":
      case "getOrderHistory":
      case "getTaxLots":
      case "getTransactionCategories":
      case "getSupportChats":
      case "setUserProperties":
      case "acceptDisclosures":
        // 补充服务门面方法全部单对象参数或零参，并入本组。
        return await this.relayPromise(msg);
      case "addToWatchlist":
      case "removeFromWatchlist":
      case "rearrangeWatchlist":
        // 双位置参数在 wire 上打包为 {watchlistId, symbols}（见
        // WsJsonClientProxy 对应方法），这里解包回 (watchlistId, symbols)。
        return await this.relaySpread(msg);
      case "disconnect":
        return this.upstream!.disconnect();
    }
  };

  private proxyResponse(msg: ProxiedResponse) {
    this.downstream.send(JSON.stringify(msg));
  }

  private async relayPromise({ request, args }: ProxiedRequest) {
    const upstream = this.ensureConnected();
    try {
      // 单参方法专用分发；双参方法（addToWatchlist 等）走 relaySpread。
      const response = await (
        upstream[request] as (args: never) => Promise<unknown>
      ).call(upstream, args as never);
      this.proxyResponse({ request, args, response });
    } catch (e) {
      this.proxyResponse({ request, args, response: e });
    }
  }

  /**
   * 双位置参数方法（addToWatchlist 等）：wire 上 args 为
   * {watchlistId, symbols}，解包为 (watchlistId, symbols) 调用。
   */
  private async relaySpread({ request, args }: ProxiedRequest) {
    const upstream = this.ensureConnected();
    const { watchlistId, symbols } = args as {
      watchlistId: number;
      symbols: string[];
    };
    try {
      const response = await (
        upstream[request] as (
          watchlistId: number,
          symbols: string[],
        ) => Promise<unknown>
      ).call(upstream, watchlistId, symbols);
      this.proxyResponse({ request, args, response });
    } catch (e) {
      this.proxyResponse({ request, args, response: e });
    }
  }

  private async relayIterable({ request, args }: ProxiedRequest) {
    const upstream = this.ensureConnected();
    const iterable = (
      upstream[request] as (args: never) => AsyncIterable<unknown>
    ).call(upstream, args as never);
    for await (const response of iterable) {
      this.proxyResponse({ request, args, response });
    }
  }

  private ensureConnected(): WsJsonClient {
    if (!this.upstream) {
      throw new Error("Not connected");
    }
    return this.upstream!;
  }
}
