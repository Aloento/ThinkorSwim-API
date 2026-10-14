import debug from "debug";
import "dotenv/config";
import { PAPER_WS_URL, RealWsJsonClient } from "../client/realWsJsonClient.js";
import { CreateAlertRequestParams } from "../client/services/createAlertMessageHandler.js";
import { OptionQuotesRequestParams } from "../client/services/optionQuotesMessageHandler.js";
import { WsJsonClient } from "../client/wsJsonClient.js";
import MarketDepthStateUpdater from "./marketDepthStateUpdater.js";
import { getAuthCode } from "./browserOauth.js";
import { MarketDepthResponse } from "../client/services/marketDepthMessageHandler.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import Authenticator from "../auth/authenticator.js";

/** login/schwab 走的是 TOSWeb 客户端（docs/TECHNICAL.md）；access_token/get 同口径 */
const REAL_CLIENT_ID = "TOSWeb";

const logger = debug("testapp");

class TestApp {
  constructor(private readonly client: WsJsonClient) {}

  async chart(symbol: string) {
    logger(" --- chart() requesting chart data ---");
    const chartRequest = {
      symbol,
      timeAggregation: "DAY",
      range: "YEAR2",
      includeExtendedHours: true,
    };
    for await (const { body } of this.client.chart(chartRequest)) {
      logger("quotes() %O", body);
    }
  }

  async accountNumber(): Promise<string> {
    logger(" --- accountNumber() requesting account number ---");
    const {
      body: { defaultAccountCode },
    } = await this.client.userProperties();
    return defaultAccountCode as string;
  }

  async accountPositions() {
    const accountNumber = await this.accountNumber();
    logger(" --- accountPositions() requesting account positions ---");
    for await (const { body } of this.client.accountPositions(accountNumber)) {
      logger("accountPositions() %O", body);
    }
  }

  async quotes(symbols: string[]) {
    logger(" --- quotes() requesting quotes ---");
    for await (const { body } of this.client.quotes(symbols)) {
      logger("quotes() %O", body);
    }
  }

  async cancelOrder(orderId: number) {
    logger(" --- cancelOrder() cancelling order ---");
    const cancelResponse = await this.client.cancelOrder(orderId);
    logger(cancelResponse);
  }

  async createAlert(request: CreateAlertRequestParams) {
    logger(" --- createAlert() creating alert ---");
    const result = await this.client.createAlert(request);
    logger("createAlert() " + JSON.stringify(result));
  }

  async cancelAlert(alertId: number) {
    logger(" --- cancelAlert() cancelling alert ---");
    const cancelResponse = await this.client.cancelAlert(alertId);
    logger(cancelResponse);
  }

  async instrumentSearch(query: string) {
    logger(" --- instrumentSearch() searching for instrument ---");
    const searchResults = await this.client.searchInstruments(query);
    logger("instrumentSearch() %O", searchResults);
  }

  async optionChain(symbol: string) {
    logger(" --- optionChain() requesting option chain ---");
    const optionChain = await this.client.optionChain(symbol);
    logger("optionChain() %O", optionChain);
  }

  async optionChainQuotes(symbol: string) {
    logger(" --- optionChainQuotes() requesting option chain quotes ---");
    const events = this.client.optionChainQuotes(symbol);
    for await (const { body } of events) {
      logger("optionChainQuotes() %O", body);
    }
  }

  async optionChainDetails(symbol: string, seriesNames: string[]) {
    logger(" --- optionChainDetails() requesting option chain details ---");
    const optionChainDetails = await this.client.optionChainDetails({
      symbol,
      seriesNames,
    });
    logger("optionChainDetails() " + JSON.stringify(optionChainDetails));
  }

  async optionQuotes(params: OptionQuotesRequestParams) {
    logger(" --- optionQuotes() requesting option quotes ---");
    for await (const { body } of this.client.optionQuotes(params)) {
      logger("optionQuotes() %O", body);
    }
  }

  async workingOrders() {
    const accountNumber = await this.accountNumber();
    logger(" --- workingOrders() requesting working orders ---");
    for await (const { body } of this.client.workingOrders(accountNumber)) {
      logger("workingOrders() %O", body);
    }
  }

  async placeLimitOrder({
    symbol,
    quantity,
    limitPrice,
  }: {
    symbol: string;
    quantity: number;
    limitPrice: number;
  }) {
    const accountNumber = await this.accountNumber();
    logger(" --- placeLimitOrder() placing limit order ---");
    const placeOrderResponse = await this.client.placeOrder({
      accountNumber,
      quantity,
      symbol,
      limitPrice,
    });
    logger("placeLimitOrder() %O", placeOrderResponse);
  }

  async marketDepth(symbol: string) {
    const stateUpdater = new MarketDepthStateUpdater();
    logger(` --- marketDepth() requesting market depth for ${symbol} ---`);
    for await (const { body: message } of this.client.marketDepth(symbol)) {
      logger("message %O", message);
      stateUpdater.handleMessage(message as MarketDepthResponse);
      logger("ask quotes: %O", stateUpdater.askQuotes);
      logger("bid quotes: %O", stateUpdater.bidQuotes);
    }
  }

  async getWatchlist(watchlistId: number) {
    logger(" --- getWatchlist() get watchlist ---");
    const watchlist = await this.client.watchlist(watchlistId);
    logger("getWatchlist() %O", watchlist);
  }

  async smoke() {
    // docs/TECHNICAL.md 冒烟路径：getAccounts → getStatement → quotes
    logger(" --- smoke() getAccounts ---");
    const accounts = await this.client.getAccounts();
    logger("getAccounts() %O", accounts);
    const items = (accounts.body as { items?: { code: string }[] }).items ?? [];
    const account = items[0]?.code;
    if (account) {
      logger(" --- smoke() getStatement(%s) ---", account);
      const statement = await this.client.getStatement(account);
      logger("getStatement() %O", statement);
    }
    await this.quotes(["AAPL"]);
  }
}

async function run() {
  // guest 冒烟路径（docs/TECHNICAL.md）：scripts/auth-guest.mjs 把
  // TOS_GUEST_ACCESS_TOKEN（可选 TOS_GUEST_WS_URL）写入 .env.blackbox，
  // paper token 必须连 papermoney 数据中心（docs/TECHNICAL.md F1）。
  const guestToken = process.env.TOS_GUEST_ACCESS_TOKEN;
  if (guestToken) {
    const client = new RealWsJsonClient({
      wsUrl: process.env.TOS_GUEST_WS_URL ?? PAPER_WS_URL,
    });
    await client.authenticateWithAccessToken({ accessToken: guestToken });
    const app = new TestApp(client);
    await app.smoke();
    client.disconnect();
    return;
  }

  const accessToken = process.env.TOS_ACCESS_TOKEN!;
  const refreshToken = process.env.TOS_REFRESH_TOKEN!;
  const username = process.env.TOS_USERNAME!;
  const password = process.env.TOS_PASSWORD!;
  const client = new RealWsJsonClient();
  if (accessToken && refreshToken) {
    await client.authenticateWithAccessToken({ accessToken, refreshToken });
    // R1 token 续期：23h 阈值后经 access_token/get（wsjson 通道）自动换 token。
    // refreshToken 一次性轮换——onTokenRotated 必须持久化，否则下次登录用作废值。
    // guest 会话无 refreshToken，Authenticator 直通并 warn 一次（不可续期）。
    client.setAuthenticator(
      new Authenticator({
        clientId: process.env.TOS_CLIENT_ID ?? REAL_CLIENT_ID,
        initial: { accessToken, refreshToken },
        channel: client,
        onTokenRotated: (tokens) =>
          storeTokenInDotEnvFile(
            tokens.accessToken,
            tokens.refreshToken ?? refreshToken,
          ),
      }),
    );
  } else if (username && password) {
    const authCode = await getAuthCode(username, password);
    await client.authenticateWithAuthCode(authCode);
    storeTokenInDotEnvFile(client.accessToken!, client.refreshToken!);
    // login/schwab 响应带回的 refreshToken（docs/TECHNICAL.md F4）同样挂上续期器
    client.setAuthenticator(
      new Authenticator({
        clientId: process.env.TOS_CLIENT_ID ?? REAL_CLIENT_ID,
        initial: {
          accessToken: client.accessToken!,
          refreshToken: client.refreshToken,
        },
        channel: client,
        onTokenRotated: (tokens) =>
          storeTokenInDotEnvFile(
            tokens.accessToken,
            tokens.refreshToken ?? client.refreshToken ?? "",
          ),
      }),
    );
  } else {
    throw new Error(
      "TOS_GUEST_ACCESS_TOKEN or TOS_ACCESS_TOKEN or TOS_USERNAME and TOS_PASSWORD env vars must be set",
    );
  }
  const app = new TestApp(client);
  await Promise.all([
    app.chart("TSLA"),
    // app.accountPositions(),
    // app.optionChain("TSLA"),
    // app.optionChainQuotes("AAPL"),
  ]);
}

function storeTokenInDotEnvFile(accessToken: string, refreshToken: string) {
  const suffix = process.env.NODE_ENV ? `.${process.env.NODE_ENV}` : "";
  const envPath = `.env${suffix}`;
  let envContent = "";
  if (existsSync(envPath)) {
    envContent = readFileSync(envPath, "utf-8");
    // Remove any existing token lines
    envContent = envContent
      .split("\n")
      .filter(
        (line) =>
          !line.startsWith("TOS_ACCESS_TOKEN=") &&
          !line.startsWith("TOS_REFRESH_TOKEN="),
      )
      .join("\n");
  }

  // Append the new token values
  const tokenLines = [
    `TOS_ACCESS_TOKEN=${accessToken}`,
    `TOS_REFRESH_TOKEN=${refreshToken}`,
  ].join("\n");

  // Ensure there's a newline between existing content and new tokens
  const newContent = envContent.trim() + "\n" + tokenLines + "\n";
  writeFileSync(envPath, newContent);
}

run().catch(console.error);
