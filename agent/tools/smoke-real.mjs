// 真实账户只读功能核对（Round-2 目标："核对所有 API 功能"）。
// ⚠️ 绝不发送任何写操作：不下单/不改自选/不删/不 logoff/不动 demo——全部只读服务。
// 前置：auth-real.mjs 成功（.env.blackbox 有 TOS_REAL_ACCESS_TOKEN/TOS_REAL_WS_URL）。
// 重点：guest 标 🔧 的服务在真实账户下应拿到成功帧（news_relevant/study_subscribe/
// scan_query/tax_lot/transactions_categories/support_chats/drawing_sets 等）。
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, ".env.blackbox") });

const token = process.env.TOS_REAL_ACCESS_TOKEN;
const wsUrl = process.env.TOS_REAL_WS_URL;
if (!token || !wsUrl) {
  console.error(
    "missing TOS_REAL_ACCESS_TOKEN/TOS_REAL_WS_URL — run auth-real.mjs",
  );
  process.exit(2);
}

const { RealWsJsonClient } = await import("../../dist/index.js");
const client = new RealWsJsonClient({ wsUrl });

let pass = 0;
let fail = 0;
let skipped = 0;
const ok = (name, detail) => {
  pass++;
  console.log(`  ✅ ${name}: ${detail}`);
};
const bad = (name, err) => {
  fail++;
  console.log(`  ❌ ${name}: ${String(err?.message ?? err).slice(0, 160)}`);
};
const skip = (name, why) => {
  skipped++;
  console.log(`  ⏭️ ${name}: ${why}`);
};
const check = async (name, fn) => {
  try {
    ok(name, await fn());
  } catch (e) {
    bad(name, e);
  }
};

const login = await client.authenticateWithAccessToken({ accessToken: token });
console.log(
  `[real] login OK user=${login?.userCode} segment=${login?.userSegment} cdi=${String(login?.userCdi).slice(0, 4)}***`,
);

console.log("[real] --- 账户域 ---");
let accountCode = null;
await check("accounts", async () => {
  const r = await client.getAccounts();
  const codes = (r.body.items ?? []).map((a) => a.code);
  accountCode = codes.find((c) => !/^D-/.test(c)) ?? codes[0] ?? null;
  return codes.join(",");
});
if (!accountCode) {
  console.error("[real] FAIL: no account code found");
  process.exit(1);
}
await check("statement", async () => {
  const r = await client.getStatement(accountCode);
  return `NET_LIQ=${r.body.values?.NET_LIQ}`;
});
await check("positions", async () => {
  const r = await client.getPositions(accountCode);
  return `items=${r.body.items?.length ?? 0}`;
});
await check("user_properties", async () => {
  const r = await client.userProperties();
  return `keys=${Object.keys(r.body).length}`;
});
await check("margin_calls", async () => {
  const r = await client.getMarginCalls();
  return `items=${r.body.items?.length ?? 0}`;
});
await check("disclosures", async () => {
  const r = await client.getDisclosures();
  return `items=${r.body.items?.length ?? 0}`;
});

console.log("[real] --- 行情域 ---");
await check("quotes(get)", async () => {
  const r = await client.getQuotes({ symbols: ["AAPL"] });
  return `MARK=${r.body.items?.[0]?.values?.MARK}`;
});
await check("quotes(stream)", async () => {
  for await (const q of client.quotes(["SPY"])) {
    return `items=${q.body.items?.length}`;
  }
  return "no frame";
});
await check("chart", async () => {
  const it = client
    .chart({ symbol: "AAPL", period: { type: "DAYS", amount: 1 } })
    [Symbol.asyncIterator]();
  const f = await Promise.race([
    it.next(),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
  ]);
  await it.return?.();
  const candles = f.value?.body?.candles;
  return `candles=${Array.isArray(candles) ? candles.length : "n/a"}`;
});
await check("market_depth", async () => {
  const it = client.marketDepth("AAPL")[Symbol.asyncIterator]();
  const f = await Promise.race([
    it.next(),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
  ]);
  await it.return?.();
  return `service=${f.value?.service}`;
});
await check("market_hours", async () => {
  const r = await client.getMarketHours({
    markets: ["EQUITY"],
    date: new Date().toISOString().slice(0, 10),
  });
  return `isOpen=${r.body.schwabMarketHours?.EQUITY?.EQ?.isOpen}`;
});

console.log("[real] --- 期权域 ---");
await check("optionChain", async () => {
  const r = await client.optionChain("AAPL");
  return `expirations=${r.body.expirations?.length ?? r.body.optionChains?.length ?? "?"}`;
});
await check("optionChainQuotes(stream)", async () => {
  const it = client.optionChainQuotes("AAPL")[Symbol.asyncIterator]();
  const f = await Promise.race([
    it.next(),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
  ]);
  await it.return?.();
  return `items=${f.value?.body?.items?.length ?? "?"}`;
});
await check("optionQuotes", async () => {
  const chain = await client.optionChain("AAPL");
  const first = chain.body.optionChains?.[0] ?? chain.body.items?.[0] ?? {};
  const opts = first.standard?.callOptions ?? first.callOptions ?? [];
  const sym = opts[0]?.symbol ?? opts[0]?.underlyingSymbol;
  if (!sym) throw new Error("no option symbol in chain");
  const r = await client.optionQuotes({
    symbols: [sym],
    minStrike: 0,
    maxStrike: 100000,
    strikeQuantity: 3,
  });
  return `${sym} items=${r.body.items?.length ?? "?"}`;
});

console.log("[real] --- guest 🔧 项真实账户核对 ---");
await check("news_headers/get_relevant", async () => {
  const r = await client.getRelevantNews({
    symbols: ["AAPL"],
    limit: 5,
    sortMode: "BY_RELEVANCE",
  });
  return `news=${r.body.news?.length ?? "?"}`;
});
await check("study/subscribe", async () => {
  const it = client
    .subscribeStudies({
      symbols: ["AAPL"],
      type: "PUBLIC",
      studies: [
        { name: "SimpleMovingAvg", aggregationPeriod: "DAY", parameters: {} },
      ],
    })
    [Symbol.asyncIterator]();
  const f = await Promise.race([
    it.next(),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
  ]);
  await it.return?.();
  return `SMA=${f.value?.body?.values?.AAPL?.SimpleMovingAvg}`;
});
await check("scan_query/get", async () => {
  const cats = await client.getWatchlists({ categories: ["PUBLIC"] });
  const wl = cats.body.categories?.[0]?.watchlists?.[0];
  if (!wl) throw new Error("no watchlist for scan");
  const r = await client.getScanQuery({
    watchlistId: wl.id,
    filters: [{ name: "PRICE", value: 100 }],
  });
  return `service=${r.service} body keys=${Object.keys(r.body).join(",")}`;
});
await check("tax_lot/get", async () => {
  const r = await client.getTaxLots({ account: accountCode });
  return `keys=${Object.keys(r.body).join(",")}`;
});
await check("transactions/categories", async () => {
  const r = await client.getTransactionCategories();
  return `keys=${Object.keys(r.body).join(",")}`;
});
await check("support_chats", async () => {
  const r = await client.getSupportChats();
  return `chats=${r.body.chats?.length ?? 0}`;
});
await check("drawing_sets", async () => {
  const r = await client.getDrawingSets("AAPL");
  return `sets=${r.body.drawingSets?.length ?? "?"}`;
});
await check("order_history(real)", async () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const r = await client.getOrderHistory({
    account: accountCode,
    startTime: nowSec - 365 * 24 * 3600,
    endTime: nowSec,
    orderEntryFields: ["ORDER_ID", "SYMBOL", "STATUS", "TIME_PLACED"],
  });
  return `entries=${r.body.orderHistoryEntries?.length ?? "?"}`;
});
await check("order_events(stream, real)", async () => {
  const it = client
    .orderEvents({ account: accountCode })
    [Symbol.asyncIterator]();
  const f = await Promise.race([
    it.next(),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
  ]);
  await it.return?.();
  return `service=${f.value?.service}`;
});
await check("workingOrders", async () => {
  const it = client.workingOrders(accountCode)[Symbol.asyncIterator]();
  const f = await Promise.race([
    it.next(),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
  ]);
  await it.return?.();
  return `service=${f.value?.service}`;
});
await check("analyst_reports/token", async () => {
  const r = await client.getAnalystReportsToken();
  return `hasAccessToken=${!!r.body.accessToken}`;
});
await check("message_center/get", async () => {
  const r = await client.getMessageCenter();
  return `keys=${Object.keys(r.body).join(",")}`;
});
await check("instrument_search", async () => {
  const r = await client.searchInstruments("AAPL");
  return `items=${r.body.items?.length ?? r.body.nearMatchInstruments?.length ?? "?"}`;
});
await check("fundamentals/history", async () => {
  const r = await client.getFundamentalsHistory({
    symbol: "AAPL",
    fields: ["EARNINGS_PER_SHARE_TTM"],
  });
  const s = r.body.quarterlyValues?.EARNINGS_PER_SHARE_TTM;
  return `points=${s ? Object.keys(s).length : 0}`;
});
await check("getNews", async () => {
  const r = await client.getNews({ symbol: "AAPL", limit: 3 });
  return `news=${r.body.news?.length ?? 0}`;
});
await check("study/categories", async () => {
  const r = await client.getStudyCategories();
  return `categories=${r.body.categories?.length ?? 0}`;
});
await check("scan_filter/get", async () => {
  const r = await client.getScanFilters();
  return `STOCK filters=${r.body.scanFilters?.STOCK?.filters?.length ?? 0}`;
});
await check("alerts/lookup", async () => {
  const r = await client.lookupAlerts();
  return `alerts=${r.body.alerts?.length ?? 0}`;
});

client.disconnect();
console.log(`\n[real] RESULT: pass=${pass} fail=${fail} skip=${skipped}`);
process.exit(fail === 0 ? 0 : 1);
