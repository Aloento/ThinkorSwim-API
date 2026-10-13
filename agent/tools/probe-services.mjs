// 黑盒服务普查 runner：登录 paper 会话后逐个请求服务并录制原始帧。
// 用法: node agent/tools/probe-services.mjs [service ...]   # 不传参数=全量
// 依赖 agent/tools/.env.blackbox 里的 TOS_GUEST_ACCESS_TOKEN / TOS_GUEST_WS_URL
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import dotenv from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, ".env.blackbox") });

const TOKEN = process.env.TOS_GUEST_ACCESS_TOKEN;
const WS_URL = process.env.TOS_GUEST_WS_URL || "wss://papermoney-services.schwab.com/Services/WsJson";
if (!TOKEN) {
  console.error("missing TOS_GUEST_ACCESS_TOKEN — run auth-guest.mjs first");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString().slice(11, 19);
const artDir = join(here, "..", "artifacts", "probe-" + new Date().toISOString().slice(0, 10));
mkdirSync(artDir, { recursive: true });

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, {
      headers: {
        Pragma: "no-cache",
        Origin: "https://trade.thinkorswim.com",
        "Cache-Control": "no-cache",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
      },
    });
    const timer = setTimeout(() => reject(new Error("connect timeout")), 15000);
    let loggedIn = false;
    ws.on("open", () =>
      ws.send(JSON.stringify({ ver: "27.*.*", fmt: "json-patches-structured", heartbeat: "2s" })),
    );
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.heartbeat) return;
      if (!loggedIn && msg.session) {
        loggedIn = true;
        ws.send(
          JSON.stringify({
            payload: [
              {
                header: { service: "login", id: "login", ver: 0 },
                params: { token: TOKEN, domain: "TOS", platform: "PROD", tag: "TOSWeb" },
              },
            ],
          }),
        );
        return;
      }
      const status = msg.payload?.[0]?.body?.authenticationStatus;
      if (status === "OK") {
        clearTimeout(timer);
        resolve(ws);
      } else if (status) {
        clearTimeout(timer);
        reject(new Error("login failed: " + status));
      }
    });
    ws.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

// 每个服务的探测请求（来自前端真实流量 + 既有代码）
const PROBES = [
  { service: "user_properties", id: "user_properties", params: {}, waitMs: 3000 },
  { service: "accounts", id: "accounts", params: {}, waitMs: 3000 },
  { service: "statement", id: "probe-statement", params: { account: "COMBINED ACCOUNT" }, waitMs: 3000 },
  { service: "positions", id: "probe-positions", params: { account: "COMBINED ACCOUNT", betaWeightingSymbols: [], fields: ["QUANTITY", "OPEN_PRICE", "NET_LIQ", "PL_OPEN", "PL_DAY"] }, waitMs: 3000 },
  { service: "order_events", id: "probe-order-events", params: { account: "COMBINED ACCOUNT", types: ["WORKING", "QUEUED", "FILLED", "CANCELED", "FINAL", "EXECUTION"] }, waitMs: 3000 },
  { service: "watchlist/categories", id: "probe-wl-categories", params: { categories: ["ACCOUNT_POSITIONS", "PERSONAL", "TOP10", "WORKING_ORDERS", "PUBLIC"] }, waitMs: 3000 },
  { service: "market_hours", id: "probe-market-hours", params: { markets: ["EQUITY", "OPTION", "FUTURE"], date: new Date().toISOString().slice(0, 10) }, waitMs: 3000 },
  { service: "margin_calls", id: "probe-margin-calls", params: {}, waitMs: 3000 },
  { service: "disclosures", id: "probe-disclosures", params: {}, waitMs: 3000 },
  { service: "message_center/get", id: "probe-msg-center", params: {}, waitMs: 3000 },
  { service: "message_center/subscribe", id: "probe-msg-sub", params: {}, waitMs: 3000 },
  { service: "quotes", id: "probe-quotes", params: { account: "COMBINED ACCOUNT", symbols: ["AAPL", "SPY", "TSLA"], refreshRate: 1000, fields: ["MARK", "BID", "ASK", "VOLUME", "LAST", "OPEN", "HIGH", "LOW", "CLOSE", "NET_CHANGE"] }, waitMs: 6000 },
  { service: "chart", id: "probe-chart-1", params: { symbol: "AAPL", timeAggregation: "DAY", range: "MONTH1", extendedHours: false, studies: [] }, waitMs: 5000 },
  { service: "instrument_search", id: "probe-search-1", params: { pattern: "TSLA", limit: 5 }, waitMs: 3000 },
  { service: "optionSeries", id: "probe-optseries-1", params: { underlying: "AAPL" }, waitMs: 4000 },
  { service: "optionSeries/quotes", id: "probe-optseriesq-1", params: { underlying: "AAPL", exchange: "BEST", fields: ["IMPLIED_VOLATILITY", "SERIES_EXPECTED_MOVE"] }, waitMs: 4000 },
  { service: "market_depth", id: "probe-depth-1", params: { symbol: "AAPL" }, waitMs: 4000 },
  { service: "alerts/lookup", id: "probe-alerts-lookup", params: { status: "ACTIVE" }, waitMs: 3000 },
  { service: "alerts/subscribe", id: "probe-alerts-sub", params: { alertTypes: ["CHANGED_ALERT", "TRIGGERED_ALERT", "EXPIRED_ALERT"] }, waitMs: 3000 },
  { service: "watchlist/get", id: "probe-wl-get", params: { watchlistId: 100 }, waitMs: 3000 },
  { service: "watchlist/get", id: "probe-wl-pos", params: { watchlistId: -2 }, waitMs: 3000 },
  { service: "chat_global/messages", id: "probe-chat", params: {}, waitMs: 2500 },
  { service: "support_chats", id: "probe-support", params: {}, waitMs: 2500 },
  { service: "user_preferences", id: "probe-user-prefs", params: {}, waitMs: 2500 },
  { service: "social_view", id: "probe-social", params: {}, waitMs: 2500 },
  { service: "screeners", id: "probe-screeners", params: { category: "PREDEFINED" }, waitMs: 2500 },
  { service: "news", id: "probe-news", params: { symbols: ["AAPL"], types: ["STORY"], maxCount: 5, filter: "ALL" }, waitMs: 4000 },
  { service: "fundamental_history", id: "probe-fund", params: { symbol: "AAPL", range: "QUARTERLY", fields: ["REVENUE", "EPS", "PE"] }, waitMs: 4000 },
  { service: "trans_history", id: "probe-trans", params: { account: "COMBINED ACCOUNT", startDate: "2026-09-01", endDate: "2026-10-13", transactions: "ALL", symbol: "" }, waitMs: 4000 },
  { service: "option_chain/get", id: "probe-chain-1", params: { underlyingSymbol: "AAPL", filter: { strikeQuantity: 2147483647, seriesNames: ["14 OCT 26 100 (Weeklys)", "16 OCT 26 100"] } }, waitMs: 5000 },
  { service: "quotes/options", id: "probe-qopt-1", params: { underlyingSymbol: "AAPL", exchange: "BEST", fields: ["BID", "ASK", "DELTA", "OPEN_INT", "VOLUME", "IMPLIED_VOLATILITY"], filter: { seriesNames: ["14 OCT 26 100 (Weeklys)", "16 OCT 26 100"], minStrike: 50, maxStrike: 500 } }, waitMs: 5000 },
  { service: "watchlist/get_all", id: "probe-wl-all", params: {}, waitMs: 3000 },
  { service: "account_history", id: "probe-achist", params: { account: "COMBINED ACCOUNT", startDate: "2026-10-01", endDate: "2026-10-13", activityTypes: ["ALL"] }, waitMs: 3000 },
  { service: "tax_lots", id: "probe-taxlots", params: { account: "COMBINED ACCOUNT", symbol: "AAPL" }, waitMs: 3000 },
  { service: "order_preview", id: "probe-opreview", params: { accountCode: "D-12345678", action: "INIT", marker: "SINGLE", orders: [{ requestType: "INIT_STOCK", orderType: "LIMIT", limitPrice: 1, legs: [{ symbol: "AAPL", quantity: 1 }] }] }, waitMs: 4000 },
  // —— bundle 挖掘 + 错误帧参数修正（第二轮）——
  { service: "news_headers/get", id: "probe-news-headers", params: { symbol: "AAPL", limit: 5 }, waitMs: 4000 },
  { service: "fundamentals/current", id: "probe-fund-cur", params: { symbol: "AAPL", time: "QUARTERLY", fields: ["REVENUE", "EARNINGS_PER_SHARE", "PRICE_TO_EARNINGS_RATIO"] }, waitMs: 4000 },
  { service: "fundamentals/history", id: "probe-fund-hist", params: { symbol: "AAPL", time: "QUARTERLY", fields: ["REVENUE", "NET_INCOME"] }, waitMs: 4000 },
  { service: "order_history", id: "probe-order-hist", params: { account: "D-12345678", startTime: Math.floor((Date.now() - 30 * 86400_000) / 1000), endTime: Math.floor(Date.now() / 1000), orderEntryFields: ["ORDER_ID", "SYMBOL", "QTY", "LIMIT_PRICE", "STATUS", "TIME_PLACED"] }, waitMs: 4000 },
  { service: "tax_lot/get", id: "probe-taxlot-get", params: { account: "COMBINED ACCOUNT", symbol: "AAPL", taxLotFields: ["QUANTITY", "COST_PER_SHARE", "OPEN_DATE"], refreshToken: "1" }, waitMs: 4000 },
  { service: "studies/get", id: "probe-studies", params: { studies: ["SimpleMovingAvg"] }, waitMs: 4000 },
  { service: "user_properties/set", id: "probe-uprops-set", params: {}, waitMs: 3000 },
  { service: "options_statistics", id: "probe-optstats", params: { symbol: "AAPL", refreshRate: 2000 }, waitMs: 5000 },
  { service: "transactions/categories", id: "probe-txn-cats", params: { account: "COMBINED ACCOUNT" }, waitMs: 3000 },
  { service: "quotes/options/centered", id: "probe-qcentered", params: { underlyingSymbol: "AAPL", exchange: "BEST", fields: ["BID", "ASK"], filter: { strikeQuantity: 100 } }, waitMs: 4000 },
  { service: "disclosures/accept", id: "probe-disc-accept", params: {}, waitMs: 3000 },
  { service: "watchlist/add", id: "probe-wl-add-absent", params: { watchlistId: 999999, symbols: ["ZZZZ"] }, waitMs: 3000 },
];

async function main() {
  const only = process.argv.slice(2);
  const probes = only.length ? PROBES.filter((p) => only.includes(p.service)) : PROBES;
  console.log(`connect ${WS_URL}`);
  const ws = await connect();
  console.log(`[${now()}] logged in, probing ${probes.length} services sequentially`);
  const report = [];

  for (const probe of probes) {
    const file = join(artDir, `${probe.service.replace(/\//g, "_")}.jsonl`);
    const req = { payload: [{ header: { service: probe.service, id: probe.id, ver: 0 }, params: probe.params }] };
    ws.send(JSON.stringify(req));
    console.log(`[${now()}] → ${probe.service} (${probe.id})`);
    const frames = [];
    const collector = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.heartbeat) return;
      if (!msg.payload) return;
      for (const item of msg.payload) {
        if (item.header?.service !== probe.service) continue; // 只收本服务
        frames.push(item);
        appendFileSync(file, JSON.stringify({ t: Date.now(), item }) + "\n");
      }
    };
    ws.on("message", collector);
    await sleep(probe.waitMs);
    ws.off("message", collector);
    const types = {};
    for (const f of frames) types[f.header.type] = (types[f.header.type] || 0) + 1;
    const sample = frames[0] ? summarize(frames[0]) : "(no response)";
    const entry = { service: probe.service, frames: frames.length, types, sample };
    report.push(entry);
    console.log(
      `    ← ${frames.length} frames ${JSON.stringify(types)} ${sample.slice(0, 150)}`,
    );
    await sleep(300);
  }

  writeFileSync(join(artDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\nreport saved: ${join(artDir, "report.json")}`);
  ws.close();
  process.exit(0);
}

// 生成结构摘要（字段名+类型，截断数组）
function summarize(item) {
  const seen = new Set();
  const shape = (v, depth) => {
    if (v === null) return "null";
    if (Array.isArray(v)) return v.length ? `[${shape(v[0], depth + 1)}${v.length > 1 ? ` +${v.length - 1}` : ""}]` : "[]";
    if (typeof v === "object") {
      if (depth > 2) return "{…}";
      const keys = Object.keys(v).slice(0, 12);
      const parts = keys.map((k) => `${k}:${shape(v[k], depth + 1)}`);
      if (Object.keys(v).length > 12) parts.push(`+${Object.keys(v).length - 1} more`);
      return `{${parts.join(",")}}`;
    }
    if (typeof v === "string") return v.length > 20 ? `"${v.slice(0, 18)}…"` : `"${v}"`;
    return typeof v;
  };
  const s = shape(item.body, 0);
  if (seen.has(s)) return s;
  return s;
}

main().catch((e) => {
  console.error("FAILED:", e?.message || e);
  process.exit(1);
});
