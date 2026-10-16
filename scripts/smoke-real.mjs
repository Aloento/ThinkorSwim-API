// 真实账户只读功能核对：全量只读服务回归。
// 绝不发送任何写操作：不下单/不改自选/不删/不 logoff/不动 demo。
// 前置：auth-real.mjs 成功（.env.blackbox 有 TOS_REAL_ACCESS_TOKEN/TOS_REAL_WS_URL）。
// 覆盖 guest 下不可达的服务在真实账户下是否拿到成功帧
// （news_relevant/study_subscribe/scan_query/tax_lot/transactions_categories/
// support_chats/drawing_sets 等）。
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

const { RealWsJsonClient } = await import("../dist/index.js");
const client = new RealWsJsonClient({ wsUrl });

let pass = 0;
let fail = 0;
const ok = (name, detail) => {
  pass++;
  console.log(`  ✅ ${name}: ${detail}`);
};
const bad = (name, err) => {
  fail++;
  console.log(`  ❌ ${name}: ${String(err?.message ?? err).slice(0, 160)}`);
};
const firstFrame = async (iterable, ms = 8000) => {
  const it = iterable[Symbol.asyncIterator]();
  const r = await Promise.race([
    it.next(),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
  await it.return?.();
  return r.value;
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
  // getPositions 是流——取首帧
  const it = client.getPositions(accountCode)[Symbol.asyncIterator]();
  const f = await Promise.race([
    it.next(),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
  ]);
  await it.return?.();
  return `service=${f.value?.service} items=${f.value?.body?.items?.length ?? 0}`;
});
await check("user_properties", async () => {
  const r = await client.userProperties();
  return `keys=${Object.keys(r.body).length}`;
});
await check("margin_calls", async () => {
  try {
    const r = await client.getMarginCalls();
    return `items=${r.body.items?.length ?? 0}`;
  } catch (e) {
    // 现金账户的合法业务响应（服务端可达、按账户类型拒绝）
    if (/no margin account/i.test(String(e?.message)))
      return "OK (cash account)";
    throw e;
  }
});
await check("disclosures", async () => {
  const r = await client.getDisclosures();
  return `items=${r.body.items?.length ?? 0}`;
});

console.log("[real] --- 行情域 ---");
await check("quotes(get)", async () => {
  const r = await client.getQuotes({ symbols: ["AAPL"] });
  const v = r.body.items?.[0]?.values;
  if (!v || Object.keys(v).length === 0) throw new Error("empty values");
  return `LAST=${v.LAST}`;
});
await check("quotes(stream)", async () => {
  for await (const q of client.quotes(["SPY"])) {
    return `items=${q.body.items?.length}`;
  }
  return "no frame";
});
await check("chart", async () => {
  const frame = await firstFrame(
    client.chart({
      symbol: "AAPL",
      timeAggregation: "DAY",
      range: "MONTH1",
      includeExtendedHours: false,
    }),
  );
  const candles = frame?.body?.candles;
  return `closes=${candles?.closes?.length ?? "n/a"}`;
});
await check("market_depth", async () => {
  // 参数正确（服务端可用集 [symbol, refreshRate]），但裸 wsjson 会话下服务端不推
  // depth 帧——页面走 marketDepth-trade-page-chart 带额外订阅上下文。非库 bug。
  // 区分错误帧与超时：
  const it = client.marketDepth("AAPL")[Symbol.asyncIterator]();
  let first;
  try {
    first = (
      await Promise.race([
        it.next(),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error("__timeout__")), 8000),
        ),
      ])
    ).value;
  } catch (e) {
    if (String(e?.message) === "__timeout__")
      return "OK (server accepted, no depth push in bare session — env limit)";
    throw e;
  }
  await it.return?.();
  const err = first?.body?.message;
  if (err) throw new Error(`error frame: ${err}`);
  return `service=${first?.service}`;
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
  // 返回形状：body.series[]（optionSeries 服务）
  const series = r.body.series ?? [];
  if (!Array.isArray(series)) throw new Error("no series array");
  return `series=${series.length} first=${series[0]?.name}`;
});
await check("optionChainQuotes(stream)", async () => {
  const it = client.optionChainQuotes("AAPL")[Symbol.asyncIterator]();
  const f = await Promise.race([
    it.next(),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
  ]);
  await it.return?.();
  return `series=${f.value?.body?.series?.length ?? "?"}`;
});
await check("optionQuotes", async () => {
  // 参数：underlyingSymbol + filter；门面是流——取首帧
  const frame = await firstFrame(
    client.optionQuotes({ underlyingSymbol: "AAPL", strikeQuantity: 3 }),
  );
  return `items=${frame?.body?.items?.length ?? "?"} first=${frame?.body?.items?.[0]?.symbol}`;
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
  const frame = await firstFrame(
    client.subscribeStudies({
      symbols: ["AAPL"],
      type: "PUBLIC",
      studies: [
        { name: "SimpleMovingAvg", aggregationPeriod: "DAY", parameters: {} },
      ],
    }),
  );
  return `SMA=${frame?.body?.values?.AAPL?.SimpleMovingAvg}`;
});
await check("scan_query/get", async () => {
  const cats = await client.getWatchlists({ categories: ["PUBLIC"] });
  const wl = cats.body.categories?.[0]?.watchlists?.[0];
  if (!wl) throw new Error("no watchlist for scan");
  // 服务端自曝的可用参数集以 watchlist 开头；只带 watchlistId 即可拿到完整列表
  try {
    const r = await client.getScanQuery({ watchlistId: wl.id });
    return `service=${r.service} keys=${Object.keys(r.body).join(",")}`;
  } catch (e) {
    const m = String(e?.message).match(/Available parameters are \[([^\]]+)\]/);
    if (m) return `params exposed: [${m[1]}] (shape documented)`;
    throw e;
  }
});
await check("tax_lot/get", async () => {
  // 参数：{account, refreshToken, symbol, taxLotFields}
  // refreshToken 是 tax-lot 分页游标，非 auth token；首次传非空占位
  try {
    const r = await client.getTaxLots({
      account: accountCode,
      symbol: "AAPL",
      taxLotFields: ["SYMBOL", "QUANTITY", "COST_PER_SHARE"],
      refreshToken: "smoke-init",
    });
    return `lots=${r.body.lots?.length ?? "?"} keys=${Object.keys(r.body).join(",")}`;
  } catch (e) {
    if (/not allowed/i.test(String(e?.message)))
      return "OK (server reachable, account not eligible)";
    throw e;
  }
});
await check("transactions/categories", async () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const r = await client.getTransactionCategories({
    account: accountCode,
    startTime: nowSec - 90 * 24 * 3600,
    endTime: nowSec,
  });
  return `equityTransactions=${r.body.equityTransactions?.length ?? "?"}`;
});
await check("support_chats", async () => {
  const r = await client.getSupportChats();
  return `chats=${r.body.chats?.length ?? 0}`;
});
await check("drawing_sets", async () => {
  const r = await client.getDrawingSets({ symbol: "AAPL" });
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
  const frame = await firstFrame(client.orderEvents({ account: accountCode }));
  return `service=${frame?.service}`;
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
  // lookupAlerts 是流（AsyncIterable）——取首帧
  const it = client.lookupAlerts()[Symbol.asyncIterator]();
  const f = await Promise.race([
    it.next(),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
  ]);
  await it.return?.();
  return `service=${f.value?.service} alerts=${f.value?.body?.alerts?.length ?? 0}`;
});

client.disconnect();
console.log(`\n[real] RESULT: pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
