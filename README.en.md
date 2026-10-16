# thinkorswim WsJson API client

> [中文](README.md) · English

A Node & browser client for the private thinkorswim WebSocket API. A modernization
of upstream `huskly/tos-wsjson-client` v0.12.0: pnpm + TypeScript 7 + Node 24, with
every service corrected against live black-box testing. Protocol details, service
parameters and findings are in [TECHNICAL.md](TECHNICAL.md).

> ⚠️ Charles Schwab International does not offer developer accounts; if you need
> programmatic trading, evaluate the official API first. The wsjson protocol used
> here is the web client's internal API, unsupported and subject to change at any
> time. The current implementation has been verified on a live account, but
> continued compatibility is not guaranteed. Always bring your own risk controls
> when automating a live account.

## Requirements

- Node ≥ 24 (pnpm 12 auto-enabled via corepack)

## Build

```bash
corepack enable
pnpm install
pnpm build          # tsc → dist/
pnpm test           # jest (incl. real-wire frame replay)
pnpm run ci         # prettier + build + lint + test
```

## Black-box tools (scripts/)

Credentials: copy `scripts/.env.blackbox.example` to `scripts/.env.blackbox` and
fill it in (untracked).

```bash
# Anonymous handshake probe (no credentials)
node scripts/probe-ws.mjs 10000

# Paper: harvest token → end-to-end smoke → place/cancel smoke ($1 limit, auto-cancel)
node scripts/auth-guest.mjs <user> <pass>
node scripts/smoke-lib.mjs
node scripts/smoke-order.mjs

# Read-only service census / write cases (paper-only, enforced by the tools)
node scripts/probe-services.mjs [service ...]
node scripts/probe-write.mjs W1|W2|W4|…

# Real account (headless by default; F2A handled automatically: approve the mobile
# push on your phone, or type the SMS code in the terminal; --headed for manual)
node scripts/auth-real.mjs
node scripts/smoke-real.mjs          # read-only smoke
node scripts/exp-auth-refresh.mjs    # token refresh regression

# Coverage audit / headless fingerprint matrix
node scripts/audit-coverage.mjs
node scripts/exp-fp.mjs
```

Legacy examples (username/password path + local proxy):

```bash
node --env-file=.env dist/example/testApp.js
node --env-file=.env dist/example/wsProxyServer.js
```

> The local proxy is unauthenticated by default — any local process can drive the
> session it proxies. Setting `TOS_PROXY_TOKEN` requires every proxied message to
> carry that token, otherwise the connection is dropped. Required on shared machines
> and any non-loopback setup.

## Auth flow (see TECHNICAL.md §4)

1. After logging into `https://trade.thinkorswim.com` (or `/guestpass`), the web
   client exchanges the oauth `code` at `tsm/authorize` for a new authCode — that
   new authCode is what wsjson needs (the raw oauth code is consumed by authorize).
2. WS `login/schwab` trades the authCode for a 32-char session token; the
   refreshToken is only minted when "trust device" is checked during F2A.
3. The session token is reusable across WS connections (~24h). Real-account F2A
   login can run fully headless (`scripts/auth-real.mjs`).
4. Tokens are bound to a data center: paper must use
   `wss://papermoney-services.schwab.com/Services/WsJson`, real accounts
   `thinkorswim-services`; wrong DC → `Invalid token (server session id)`.
   Select via `new RealWsJsonClient({ wsUrl: PAPER_WS_URL })`.

## Capabilities (parity table in TECHNICAL.md §6)

| Domain       | Capabilities                                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth         | access token / authCode login; `getAccessToken` refresh; `auth_code/get`                                                                              |
| Accounts     | accounts / statement / positions / margin calls / disclosures / user properties / order history / tax lots / transaction categories                   |
| Quotes       | quote stream & one-shot quotes · candles · market depth · market hours                                                                                |
| Options      | option chain · chain quotes · chain details · option statistics                                                                                       |
| Fundamentals | current/history fundamentals · study catalog (441) · study value subscription                                                                         |
| News         | headers / relevant news / body / subscriptions                                                                                                        |
| Screener     | filter & parameters / query                                                                                                                           |
| Drawings     | drawing CRUD · drawing sets                                                                                                                           |
| Search       | instrument search · analyst reports                                                                                                                   |
| Trading      | LIMIT/MARKET/STOP/STOPLIMIT orders (two-step CONFIRM→SUBMIT internally) · modify/cancel · order event stream (raw + normalized status) · safety guard |
| Alerts       | create / cancel / lookup / subscribe                                                                                                                  |
| Watchlists   | create / rename / delete / add / remove / rearrange                                                                                                   |
| Message ctr  | fetch / subscribe                                                                                                                                     |
| Other        | subscription cleanup · support chat · demo account top-up (⚠️) · logoff (⚠️)                                                                          |

Built into the connection layer: exponential-backoff reconnect, heartbeat watchdog,
handshake/login timeouts, subscription replay after reconnect; early `break` in
`for-await` sends `unsubscribe` automatically; all errors are `Error` subclasses
(`WebSocketApiError` / `AuthError` / `TransportError` / `GuardError`).

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

// Place an order (two-step internally; server errors reject as WebSocketApiError)
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

// Order event stream: normalized status (WORKING/FILLED/CANCELED/…)
for await (const event of client.observeOrders("<paper-account-code>")) {
  console.log(event.orderId, event.status, event.filledQuantity);
}
```

## Trading safety gate (optional, off by default)

`RealWsJsonClientOptions.guard` validates at the order/modify/cancel entry points;
a violation throws `GuardError` and nothing reaches the wire:

```typescript
const client = new RealWsJsonClient({
  wsUrl: PAPER_WS_URL,
  guard: {
    paperOnly: true, // papermoney endpoint only
    allowedAccountCodes: ["<paper-account-code>"],
    maxQuantity: 100,
    maxNotionalUsd: 5000,
  },
});
```

More in `src/example/testApp.ts` and `scripts/smoke-*.mjs`.

## Known limitations

- **Fractional (notional) buy orders only work reliably as MARKET + a decimal
  `legs.quantity`** (TECHNICAL.md §5.3): there is no `AMOUNT` order type;
  `isNotional` is a trap (rejected at CONFIRM, and at SUBMIT the paper endpoint
  accepts it but fills whole shares); minimum $1 and ≤ 4 decimal places; round
  quantity with `floor` so the cost never exceeds the planned notional. Paper's
  fractional semantics differ from live and cannot be used to verify them.
- Some services are permission-gated for guest sessions (relevant news, screener,
  tax-lot deep lookups); real accounts work. Write endpoints were not automated
  against real accounts by test discipline.
- Token auto-refresh (`src/auth/authenticator.ts`): the accessToken minted by
  `access_token/get` is an EAT, not used by the wsjson login frame — an expired
  session token requires re-running the login chain. The refreshToken rotates
  one-time; persist the new value in `onTokenRotated`.
- `market_depth`: accepted but silent in a bare real-account session (the web client
  runs a larger flow with extra subscription context); guest gets a snapshot.
- The private protocol drifts: the server build keeps iterating and parameters,
  enums and error shapes may change. Re-census anytime with `pnpm run ci` and
  `scripts/probe-services.mjs`.
