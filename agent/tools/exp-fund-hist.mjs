// 一次性实验：fundamentals/history 最小参数，让服务端错误帧自曝 Available parameters
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, ".env.blackbox") });

const ws = new WebSocket(
  process.env.TOS_GUEST_WS_URL ||
    "wss://papermoney-services.schwab.com/Services/WsJson",
  {
    headers: {
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      Origin: "https://trade.thinkorswim.com",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
    },
  },
);
ws.on("open", () =>
  ws.send(
    JSON.stringify({
      ver: "27.*.*",
      fmt: "json-patches-structured",
      heartbeat: "2s",
    }),
  ),
);
let stage = 0;
ws.on("message", (d) => {
  const msg = JSON.parse(d.toString());
  if (msg.heartbeat) return;
  if (!stage && msg.session) {
    ws.send(
      JSON.stringify({
        payload: [
          {
            header: { service: "login", id: "login", ver: 0 },
            params: {
              token: process.env.TOS_GUEST_ACCESS_TOKEN,
              domain: "TOS",
              platform: "PROD",
              tag: "TOSWeb",
            },
          },
        ],
      }),
    );
    stage = 1;
    return;
  }
  if (stage === 1 && msg.payload?.[0]?.body?.authenticationStatus === "OK") {
    stage = 2;
    // 全部 45 个 current 枚举字段一次提交——错误帧自曝哪些是 non-historical
    ws.send(
      JSON.stringify({
        payload: [
          {
            header: { service: "fundamentals/history", id: "fh-min", ver: 0 },
            params: {
              symbol: "AAPL",
              fields: [
                "EARNINGS_PER_SHARE_TTM",
                "DIVIDENDS_PER_SHARE_TTM",
                "BOOK_VALUE_PER_SHARE",
                "CASH_FLOW_PER_SHARE_CURRENT",
                "FREE_CASH_FLOW_PER_SHARE",
                "SALES_PER_SHARE",
                "RETURN_ON_EQUITY",
                "RETURN_ON_ASSETS",
                "GROSS_PROFIT_MARGIN",
                "OPERATING_PROFIT_MARGIN",
                "TAX_RATE",
                "INTEREST_RATE",
                "NET_PROFIT_MARGIN",
                "TOTAL_ASSET_TURNOVER",
                "INVENTORY_TURNOVER",
                "LONG_TERM_DEBT_TO_CAPITAL",
                "FINANCIAL_LEVERAGE",
                "FIXED_CHARGE_COVERAGE_RATIO",
                "DIVIDEND_PAYOUT",
                "QUICK_RATIO",
                "CURRENT_RATIO",
                "PRICE_TO_EARNINGS_RATIO",
                "PRICE_TO_CASH_FLOW_RATIO",
                "PRICE_TO_BOOK_VALUE_RATIO",
                "MARKET_CAP_TO_COMMON_EQUITY_RATIO",
                "DIVIDEND_YIELD",
                "DIVIDEND_PAYOUT_PER_SHARE",
                "REVENUE",
                "NET_INCOME",
                "EARNINGS_PER_SHARE",
                "DIVIDENDS_PER_SHARE",
                "BOOK_VALUE_PER_SHARE_GROWTH",
                "EBITDA",
                "COMPANY_NAME",
                "COMPANY_ADDRESS_STREET",
                "COMPANY_ADDRESS_CITY",
                "COMPANY_ADDRESS_STATE",
                "COMPANY_ADDRESS_ZIP",
                "COMPANY_ADDRESS_NATION",
                "COMPANY_WEBSITE",
                "COMPANY_PHONE",
                "COMPANY_BUSINESS_DESCRIPTION",
                "LAST_ANNUAL_FILING_DATE",
                "LAST_INTERIM_FILING_DATE",
                "DATE_OF_INCORPORATION",
              ],
            },
          },
        ],
      }),
    );
    return;
  }
  if (stage === 2 && msg.payload) {
    for (const e of msg.payload) {
      if (e.header?.id === "fh-min") {
        console.log(
          "min-params →",
          e.header.type,
          JSON.stringify(e.body).slice(0, 500),
        );
        process.exit(0);
      }
    }
  }
});
setTimeout(() => {
  console.log("TIMEOUT");
  process.exit(1);
}, 15000);
