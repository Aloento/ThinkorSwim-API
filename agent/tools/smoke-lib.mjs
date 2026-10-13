// 端到端冒烟：用编译后的库 API（RealWsJsonClient）跑 guest paper 会话。
// 前置：pnpm build 且 agent/tools/.env.blackbox 有 TOS_GUEST_ACCESS_TOKEN（过期则先跑 auth-guest.mjs）。
// 验证门面方法在真实服务器上的行为：login→accounts→statement→market_hours→quotes→watchlist。
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, ".env.blackbox") });

const { RealWsJsonClient, PAPER_WS_URL } = await import("../../dist/index.js");

const token = process.env.TOS_GUEST_ACCESS_TOKEN;
if (!token) {
  console.error("missing TOS_GUEST_ACCESS_TOKEN");
  process.exit(2);
}

const client = new RealWsJsonClient({ wsUrl: PAPER_WS_URL });
const login = await client.authenticateWithAccessToken({ accessToken: token });
console.log("[smoke] login OK:", login?.authenticationStatus, "user=", login?.userCode);

const accounts = await client.getAccounts();
const first = accounts.body.items?.[0];
console.log("[smoke] accounts:", accounts.body.items?.map((a) => a.code).join(","));

const statement = await client.getStatement("COMBINED ACCOUNT");
console.log("[smoke] statement NET_LIQ:", statement.body.values?.NET_LIQ);

const mh = await client.getMarketHours(["EQUITY"], new Date().toISOString().slice(0, 10));
console.log("[smoke] market_hours EQUITY isOpen:", mh.body.schwabMarketHours?.EQUITY?.EQ?.isOpen);

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

const cats = await client.getWatchlists(["PUBLIC"]);
const wl = cats.body.categories?.[0]?.watchlists?.[0];
console.log("[smoke] watchlists:", cats.body.categories?.[0]?.name, wl ? `first=${wl.name}(${wl.id})` : "(none)");
if (wl) {
  const one = await client.watchlist(wl.id);
  console.log("[smoke] watchlist/get:", one.body.watchlist?.name, "symbols=", one.body.watchlist?.symbols?.length);
}

client.disconnect();
console.log("[smoke] DONE — all facade methods round-tripped against live paper server");
process.exit(0);
