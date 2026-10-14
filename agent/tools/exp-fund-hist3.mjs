// 逐个测试 history 字段：accepted 或 "Non historical field" 二分
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, ".env.blackbox") });

const ws = new WebSocket(
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

const CANDIDATES = [
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
];

let loggedIn = false;
let idx = -1;
const results = [];
const pending = new Map(); // id -> field

function next() {
  idx++;
  if (idx >= CANDIDATES.length) {
    console.log("\n=== RESULTS ===");
    for (const r of results) console.log(r);
    process.exit(0);
  }
  const field = CANDIDATES[idx];
  const id = `fh-${idx}`;
  pending.set(id, field);
  ws.send(
    JSON.stringify({
      payload: [
        {
          header: { service: "fundamentals/history", id, ver: 0 },
          params: { symbol: "AAPL", fields: [field] },
        },
      ],
    }),
  );
  setTimeout(() => {
    if (pending.has(id)) {
      results.push(`${field} -> TIMEOUT`);
      pending.delete(id);
      next();
    }
  }, 5000);
}

ws.on("message", (d) => {
  const msg = JSON.parse(d.toString());
  if (msg.heartbeat) return;
  if (!loggedIn && msg.session) {
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
    return;
  }
  if (msg.payload?.[0]?.body?.authenticationStatus === "OK") {
    loggedIn = true;
    next();
    return;
  }
  if (msg.payload && loggedIn) {
    for (const e of msg.payload) {
      const field = pending.get(e.header?.id);
      if (!field) continue;
      pending.delete(e.header.id);
      if (e.header.type === "error") {
        results.push(
          `${field} -> error: ${String(e.body?.message).slice(0, 80)}`,
        );
      } else {
        results.push(
          `${field} -> ${e.header.type} body=${JSON.stringify(e.body).slice(0, 200)}`,
        );
      }
      setTimeout(next, 300);
    }
  }
});
setTimeout(() => {
  console.log("GLOBAL TIMEOUT", results);
  process.exit(1);
}, 120000);
