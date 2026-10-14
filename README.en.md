# thinkorswim WsJson API client

> [中文](README.md) · English

A Node & browser client for the private thinkorswim WebSocket API (reverse-engineered
black-box). A modernization of upstream `huskly/tos-wsjson-client` v0.12.0:
pnpm + TypeScript 7 + Node 24, with every service corrected against live 2026-10
black-box testing (guest paper session + read-only real-account regression).

🚧 Still early — the protocol is private and can drift — but the core
trading/quotes/account paths run end-to-end against the real paper server. For the
full feature parity table and protocol details see
[docs/TECHNICAL.md](docs/TECHNICAL.md). 🚧

## Requirements

- Node ≥ 24 (recommended; `packageManager` is pnpm 12, auto-enabled via corepack)

## Build

```bash
corepack enable
pnpm install
pnpm build          # tsc → dist/
pnpm test           # jest (incl. real-wire frame replay, 112 cases)
pnpm run ci         # prettier + build + lint + test
```

> ⚠️ In pnpm v12 a bare `pnpm ci` is an install alias that gives a false green —
> always verify with `pnpm run ci`.

## Black-box tools (scripts/)

Credential template: `cp scripts/.env.blackbox.example scripts/.env.blackbox` and fill
it in (gitignored; recordings under `scripts/artifacts/` and browser profiles under
`scripts/puppeteer-data*/` are also untracked, and secrets are redacted before any
evidence is written to disk).

```bash
# L0 anonymous handshake probe (no credentials, run anytime)
node scripts/probe-ws.mjs 10000

# Guest paper: harvest token → end-to-end smoke → place/cancel smoke ($1 limit, auto-cancel)
node scripts/auth-guest.mjs <user> <pass>
node scripts/smoke-lib.mjs
node scripts/smoke-order.mjs

# Read-only service census (30+, raw frame recording) / write cases (paper hard gate)
node scripts/probe-services.mjs [service ...]
node scripts/probe-write.mjs W1|W2|W4|…

# Real account (headless by default; F2A auto channel: mobile push approve on your
# phone / SMS code typed in terminal; auto-checks "trust device" to mint a refreshToken;
# --headed falls back to manual)
node scripts/auth-real.mjs
node scripts/smoke-real.mjs          # 32-item read-only check
node scripts/exp-auth-refresh.mjs    # token-refresh chained-rotation regression

# Coverage audit / headless fingerprint matrix
node scripts/audit-coverage.mjs
node scripts/exp-fp.mjs
```

The legacy testApp (username/password path + proxy example) still works:

```bash
node --env-file=.env dist/example/testApp.js
node --env-file=.env dist/example/wsProxyServer.js
```

> **Local proxy security**: `WsJsonServerProxy` is unauthenticated by default — any
> local process can drive the trading session it proxies. Setting `TOS_PROXY_TOKEN`
> requires every proxied message to carry that token (mismatch → `{"error":
"unauthorized"}` + disconnect); unknown requests return `unknown request`, invalid
> JSON returns `invalid json`. **Required** on shared machines and any non-loopback setup.

## Auth flow (live-tested 2026-10; see docs/TECHNICAL.md §4)

1. **login → authCode**: after logging into `https://trade.thinkorswim.com` (or
   `/guestpass`), the frontend calls `POST tosweb-sm…/api/v1/tsm/authorize` with the
   oauth `code`; the **new authCode** in the response is what wsjson needs (the raw
   oauth code is consumed by authorize). Helper: `src/auth/guestpass.ts`.
2. **authCode → token**: connect WS `login/schwab` (`{authCode, clientId, redirectUri,
tag}`) → returns `token` and `accessTokenInfo.refreshToken`. **refreshToken is only
   minted when "trust device" is checked during F2A**; the `login` frame (token re-use)
   carries no accessTokenInfo, so harvesting must capture the page's `login/schwab`
   frame (`scripts/auth-real.mjs` automates this).
3. **token → session**: the `login` service re-uses the token (reusable across WS
   connections, ~24h). Real-account F2A login is **headless by default**: the script
   auto-fills credentials, auto-checks "trust device", prefers "Send a mobile
   notification" (approve on your phone), falls back to "Text Message" (code typed in
   the terminal). Chrome 155's new headless is fingerprint-identical to headed
   (`scripts/exp-fp.mjs`); default stealth already matches the verified fingerprint.
4. ⚠️ **Data center is bound to the token**: paper must use
   `wss://papermoney-services.schwab.com/Services/WsJson`; real accounts use
   `thinkorswim-services`. Wrong DC → `Invalid token (server session id)`.
   Select via `new RealWsJsonClient({ wsUrl: PAPER_WS_URL })`.

## Supported API (all live-tested; parity table in docs/TECHNICAL.md §6)

| Domain       | Capabilities                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth         | access token / authCode; PAPER & real endpoints; cross-connection token reuse; `getAccessToken` (refreshToken channel, scope `"api"`) · `auth_code/get`                                                                                                                                                                                                                                                                                      |
| Accounts     | accounts · statement · positions · margin_calls · disclosures(+/accept) · user_properties(+/set) · order_history · tax_lot(get/update) · transactions/categories                                                                                                                                                                                                                                                                             |
| Quotes       | quotes · quotes/get · chart (extendedHours/priceType/tick, id configurable) · market_depth · market_hours                                                                                                                                                                                                                                                                                                                                    |
| Options      | optionSeries · optionSeries/quotes · option_chain/get · quotes/options · options_statistics                                                                                                                                                                                                                                                                                                                                                  |
| Fundamentals | fundamentals/current(+history) · studies/get · study/categories (441 indicators) · study/subscribe                                                                                                                                                                                                                                                                                                                                           |
| News         | news_headers/get · get_relevant · subscribe(_relevant) · news_body                                                                                                                                                                                                                                                                                                                                                                           |
| Screener     | scan_filter/get · scan_filter/parameters · scan_query/get · scan_query/save                                                                                                                                                                                                                                                                                                                                                                  |
| Drawings     | drawing/create·update·delete · drawing_set/create·delete · drawing_sets · drawings                                                                                                                                                                                                                                                                                                                                                           |
| Search       | instrument_search · analyst_reports/token                                                                                                                                                                                                                                                                                                                                                                                                    |
| Trading      | **two-step order CONFIRM→SUBMIT (same draft id, handled internally)** · LIMIT/MARKET/STOP/STOPLIMIT (discriminated union) · tif DAY/GTC/EXT/GTC_EXT/AM/PM · option legs · replaceOrder(EDIT_ORDER) · cancel_order · order_history · **orderEvents raw stream / observeOrders normalized event stream (status mapped to the frontend's official enum)** · **guard safety gate (paperOnly / allowlist / quantity / notional, off by default)** |
| Alerts       | alerts/create · alerts/cancel · alerts/lookup · alerts/subscribe                                                                                                                                                                                                                                                                                                                                                                             |
| Watchlists   | watchlist get/categories/create/rename/delete/**add/remove/rearrange**                                                                                                                                                                                                                                                                                                                                                                       |
| Message ctr  | message_center/get · message_center/subscribe                                                                                                                                                                                                                                                                                                                                                                                                |
| Other        | unsubscribe (subscription cleanup) · support chat (chat/create·close·send_message · support_chat/messages · chat_global/messages) · demo_account(⚠️) · logoff(⚠️)                                                                                                                                                                                                                                                                            |

> **Built into the connection layer** (on by default): exponential-backoff auto-reconnect
> (0.5s→30s+jitter), heartbeat watchdog (10s), handshake/login timeout (15s), replay of
> active streaming subscriptions after reconnect; early `break`/throw in `for-await`
> auto-reclaims the patch base and sends `unsubscribe` (disable via `autoUnsubscribe`);
> all errors are `Error` subclasses (`WebSocketApiError`/`AuthError`/`TransportError`).

## Usage

```typescript
import {
  RealWsJsonClient,
  PAPER_WS_URL,
  WebSocketApiError,
} from "tos-wsjson-client";

const client = new RealWsJsonClient({ wsUrl: PAPER_WS_URL });
await client.authenticateWithAccessToken({ accessToken });

const { body } = await client.getAccounts();
for await (const { body: q } of client.quotes(["AAPL", "SPY"])) {
  console.log(q.items);
  break; // first frame is enough
}

// Place an order (two-step internally; error frames reject as WebSocketApiError)
try {
  const { body: placed } = await client.placeOrder({
    accountNumber: "<paper-account-code>", // via getAccounts()
    symbol: "AAPL",
    quantity: 1,
    limitPrice: 340.0,
  });
  console.log("orderId", placed.orderId);
} catch (e) {
  if (e instanceof WebSocketApiError) console.error("server:", e.message);
}

// Order event stream: normalized status (WORKING/FILLED/CANCELED/… per the frontend enum)
for await (const event of client.observeOrders("<paper-account-code>")) {
  console.log(event.orderId, event.status, event.filledQuantity);
}
```

## Trading safety gate (optional, off by default)

`RealWsJsonClientOptions.guard` validates at the confirmOrder/submitOrder/replaceOrder/
cancelOrder entry points; a violation throws `GuardError` (Promise reject, zero wire
frames). `paperOnly` checks whether the session wsUrl is the papermoney endpoint; with
`maxNotionalUsd` set, MARKET orders (unknown notional) are conservatively rejected:

```typescript
const client = new RealWsJsonClient({
  wsUrl: PAPER_WS_URL,
  guard: {
    paperOnly: true,
    allowedAccountCodes: ["<paper-account-code>"],
    maxQuantity: 100,
    maxNotionalUsd: 5000,
  },
});
```

More in `src/example/testApp.ts` and `scripts/smoke-*.mjs`.

## Known limitations

- Some services are permission-gated for guest (news/relevant, screener, tax_lot deep
  lookups, etc.) — all regressed against a real account (`smoke-real.mjs` 32/32); only
  write paths (tax_lot/update, drawing writes, saveScanQuery, support-chat writes,
  demo_account) are excluded from real-account automation by test discipline.
- Token auto-refresh: `Authenticator` (src/auth/authenticator.ts) refreshes past a 23h
  threshold via `access_token/get` (scope `"api"`); the `onTokenRotated` callback must
  persist the new refreshToken (one-time rotation; end-to-end chained refresh verified).
  ⚠️ The refreshed accessToken is an **EAT** (for EAT-authenticated REST/services), not
  the 32-char session token used by the wsjson `login` frame — an expired session token
  requires re-running the login chain.
- `market_depth`: the real account accepts the request in a bare wsjson session but
  pushes no depth frames (the page runs a larger flow with extra subscription context);
  guest gets a snapshot. Parameters are correct — a server-side environment limit, not a
  implementation gap.
- Private protocol; the server build drifts. `pnpm run ci` and `scripts/probe-*.mjs`
  re-census at any time.

## License

MIT
