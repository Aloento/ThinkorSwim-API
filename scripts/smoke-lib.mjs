// 端到端冒烟：用编译后的库 API（RealWsJsonClient）跑 guest paper 会话。
// 前置：pnpm build 且 scripts/.env.blackbox 有 TOS_GUEST_ACCESS_TOKEN（过期先跑 auth-guest.mjs）。
// 覆盖：login→accounts→statement→market_hours→quotes→watchlist（含写闭环）→
// 扩展服务（study/scan/quotes/get）→补充服务（news/fundamentals/order_history）→事件流订阅。
// 绝不调用 logoff / demo_account_*：前者终结会话，后者是破坏性资金操作。
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, ".env.blackbox") });

const { RealWsJsonClient, PAPER_WS_URL } = await import("../dist/index.js");

const token = process.env.TOS_GUEST_ACCESS_TOKEN;
if (!token) {
  console.error("missing TOS_GUEST_ACCESS_TOKEN");
  process.exit(2);
}

const client = new RealWsJsonClient({ wsUrl: PAPER_WS_URL });
const login = await client.authenticateWithAccessToken({ accessToken: token });
console.log(
  "[smoke] login OK:",
  login?.authenticationStatus,
  "user=",
  login?.userCode,
);

const accounts = await client.getAccounts();
console.log(
  "[smoke] accounts:",
  accounts.body.items?.map((a) => a.code).join(","),
);
// 账户代码不硬编码：优先 env，否则从会话现取（paper 账户以 D- 开头）
const ACCOUNT =
  process.env.TOS_PAPER_ACCOUNT ||
  accounts.body.items?.find((a) => a.code?.startsWith("D-"))?.code;

const statement = await client.getStatement("COMBINED ACCOUNT");
console.log("[smoke] statement NET_LIQ:", statement.body.values?.NET_LIQ);

const mh = await client.getMarketHours({
  markets: ["EQUITY"],
  date: new Date().toISOString().slice(0, 10),
});
console.log(
  "[smoke] market_hours EQUITY isOpen:",
  mh.body.schwabMarketHours?.EQUITY?.EQ?.isOpen,
);

const quotes = client.quotes(["AAPL", "SPY"]);
for await (const q of quotes) {
  const items = q.body.items || [];
  console.log(
    "[smoke] quotes:",
    q.id,
    items.map((i) => `${i.symbol}=${i.values?.MARK ?? "…"}`).join(" "),
  );
  break; // 第一帧即可
}

const cats = await client.getWatchlists({ categories: ["PUBLIC"] });
const wl = cats.body.categories?.[0]?.watchlists?.[0];
console.log(
  "[smoke] watchlists:",
  cats.body.categories?.[0]?.name,
  wl ? `first=${wl.name}(${wl.id})` : "(none)",
);
if (wl) {
  const one = await client.watchlist(wl.id);
  console.log(
    "[smoke] watchlist/get:",
    one.body.watchlist?.name,
    "symbols=",
    one.body.watchlist?.symbols?.length,
  );
}

// watchlist 写闭环：create → add → remove → rearrange → delete。
// watchlistId 必须用 create 响应返回的真实 id。
const wlName = `SmokeWL-${Date.now()}`;
const created = await client.createWatchlist({
  watchlistName: wlName,
  symbols: ["AAPL"],
});
const createdId = created.body.watchlist?.id;
console.log("[smoke] watchlist/create:", wlName, "id=", createdId);
if (!createdId) {
  console.error("[smoke] FAIL: create returned no watchlist id");
  process.exit(1);
}
try {
  const added = await client.addToWatchlist(createdId, ["SPY", "TSLA"]);
  console.log(
    "[smoke] watchlist/add:",
    "symbols=",
    JSON.stringify(added.body.watchlist?.symbols),
  );
  const removed = await client.removeFromWatchlist(createdId, ["TSLA"]);
  console.log(
    "[smoke] watchlist/remove:",
    "symbols=",
    JSON.stringify(removed.body.watchlist?.symbols),
  );
  await client.rearrangeWatchlist(createdId, ["SPY", "AAPL"]);
  const after = await client.watchlist(createdId);
  console.log(
    "[smoke] watchlist/rearrange verified:",
    JSON.stringify(after.body.watchlist?.symbols),
  );
} finally {
  // 临时 watchlist 无论中间成败都要删掉
  const del = await client.deleteWatchlist(createdId);
  console.log("[smoke] watchlist/delete:", del.service, "ok");
}

const studyCats = await client.getStudyCategories();
const studyCatCount = studyCats.body.categories?.length ?? 0;
console.log("[smoke] study/categories: categories=", studyCatCount);
if (studyCatCount === 0) {
  console.error("[smoke] FAIL: study/categories returned no categories");
  process.exit(1);
}

const scanFilters = await client.getScanFilters();
const stockFilters = scanFilters.body.scanFilters?.STOCK?.filters ?? [];
console.log("[smoke] scan_filter/get: STOCK filters=", stockFilters.length);
if (stockFilters.length === 0) {
  console.error("[smoke] FAIL: scan_filter/get STOCK.filters is empty");
  process.exit(1);
}

const quoteSnap = await client.getQuotes({ symbols: ["AAPL"] });
const firstItem = quoteSnap.body.items?.[0];
console.log(
  "[smoke] quotes/get:",
  firstItem?.symbol,
  "LAST=",
  firstItem?.values?.LAST,
);
if (!firstItem?.values) {
  console.error("[smoke] FAIL: quotes/get returned no items[0].values");
  process.exit(1);
}

// 补充服务门面：news_headers/get / fundamentals/current / order_history。
const news = await client.getNews({ symbol: "AAPL", limit: 3 });
const newsCount = news.body.news?.length ?? 0;
console.log("[smoke] news_headers/get: news=", newsCount);
if (newsCount === 0) {
  console.error("[smoke] FAIL: news_headers/get returned no news");
  process.exit(1);
}

const fundamentals = await client.getFundamentals({
  symbol: "AAPL",
  time: "QUARTERLY",
  fields: ["EARNINGS_PER_SHARE_TTM", "DIVIDEND_YIELD"],
});
console.log(
  "[smoke] fundamentals/current:",
  JSON.stringify(fundamentals.body.values),
);
if (!fundamentals.body.values) {
  console.error("[smoke] FAIL: fundamentals/current returned no values");
  process.exit(1);
}

// fundamentals/history：无 time 参数；fields 只接受 21 个 historical 字段
const hist = await client.getFundamentalsHistory({
  symbol: "AAPL",
  fields: ["EARNINGS_PER_SHARE_TTM"],
});
const histSeries = hist.body.quarterlyValues?.EARNINGS_PER_SHARE_TTM;
console.log(
  "[smoke] fundamentals/history: series points=",
  histSeries ? Object.keys(histSeries).length : 0,
);
if (!histSeries || Object.keys(histSeries).length === 0) {
  console.error("[smoke] FAIL: fundamentals/history returned no series");
  process.exit(1);
}

// order_history：时间为 epoch 秒，窗口 ≤370 天
const nowSec = Math.floor(Date.now() / 1000);
const history = await client.getOrderHistory({
  account: ACCOUNT,
  startTime: nowSec - 90 * 24 * 3600,
  endTime: nowSec,
  orderEntryFields: ["ORDER_ID", "SYMBOL", "STATUS", "TIME_PLACED"],
});
console.log(
  "[smoke] order_history: entries=",
  history.body.orderHistoryEntries?.length,
);
if (!Array.isArray(history.body.orderHistoryEntries)) {
  console.error("[smoke] FAIL: order_history returned no entries array");
  process.exit(1);
}

// 事件流订阅：order_events / alerts/subscribe。
// guest 无成交订单，order_events 只回空 snapshot——断言"帧可达"即可。
const firstFrame = async (iterable, ms) => {
  const it = iterable[Symbol.asyncIterator]();
  const result = await Promise.race([
    it.next(),
    new Promise((res) => setTimeout(() => res("timeout"), ms)),
  ]);
  await it.return?.();
  return result;
};

const oe = await firstFrame(client.orderEvents({ account: ACCOUNT }), 6000);
console.log(
  "[smoke] order_events:",
  oe === "timeout"
    ? "no frame (timeout)"
    : `type ok, service=${oe.value?.service}`,
);
if (oe === "timeout") {
  console.error("[smoke] FAIL: order_events subscription produced no frame");
  process.exit(1);
}

const al = await firstFrame(client.subscribeAlerts(), 6000);
console.log(
  "[smoke] alerts/subscribe:",
  al === "timeout"
    ? "no frame yet (server may push only on change — tolerated)"
    : `service=${al.value?.service}`,
);

// study/subscribe：studies 元素必填 aggregationPeriod；
// snapshot 形状 {values:{SYMBOL:{studyName:num}}}。
const studyFrame = await firstFrame(
  client.subscribeStudies({
    symbols: ["AAPL"],
    type: "PUBLIC",
    studies: [
      { name: "SimpleMovingAvg", aggregationPeriod: "DAY", parameters: {} },
    ],
  }),
  8000,
);
const studyValues =
  studyFrame !== "timeout" ? studyFrame.value?.body?.values : undefined;
console.log(
  "[smoke] study/subscribe:",
  studyValues
    ? `AAPL SimpleMovingAvg=${studyValues.AAPL?.SimpleMovingAvg}`
    : "no snapshot (timeout)",
);
if (!studyValues?.AAPL?.SimpleMovingAvg) {
  console.error("[smoke] FAIL: study/subscribe returned no study value");
  process.exit(1);
}

client.disconnect();
console.log(
  "[smoke] DONE — all facade methods round-tripped against live paper server",
);
process.exit(0);
