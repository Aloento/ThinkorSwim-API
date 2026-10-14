# thinkorswim WsJson API client

> 中文 · [English](README.en.md)

Node 和浏览器可用的 thinkorswim 私有 WebSocket API 客户端（黑盒逆向）。
基于上游 `huskly/tos-wsjson-client` v0.12.0 现代化重构：pnpm + TypeScript 7 +
Node 24，所有服务经 2026-10 线上黑盒实测校正（guest 模拟盘 + 真实账户只读回归）。

🚧 仍属早期（协议私有、随时可能漂移），但核心交易/行情/账户链路已端到端跑通
真实模拟盘，功能对账与协议细节见 [docs/TECHNICAL.md](docs/TECHNICAL.md)。 🚧

## 前置要求

- Node ≥ 24（推荐；`packageManager` 为 pnpm 12，经 corepack 自动启用）

## 构建

```bash
corepack enable
pnpm install
pnpm build          # tsc → dist/
pnpm test           # jest（含真实线帧回放测试，112 用例）
pnpm run ci         # prettier + build + lint + test 四关
```

> ⚠️ pnpm v12 里裸 `pnpm ci` 是 install 别名的"假绿"，验证一律 `pnpm run ci`。

## 黑盒工具（scripts/）

凭据模板：`cp scripts/.env.blackbox.example scripts/.env.blackbox` 填写
（gitignored；录制产物 `scripts/artifacts/`、浏览器 profile `scripts/puppeteer-data*/`
同样不入库，且证据落盘前自动脱敏）。

```bash
# L0 匿名握手探针（无凭据，随时可跑）
node scripts/probe-ws.mjs 10000

# guest 模拟盘：登录收割 token → 端到端冒烟 → 下单/撤单冒烟（$1 限价 1 股自动撤）
node scripts/auth-guest.mjs <user> <pass>
node scripts/smoke-lib.mjs
node scripts/smoke-order.mjs

# 只读服务普查（30+ 项，原始帧录制）/ 写用例（paper 硬闸门）
node scripts/probe-services.mjs [service ...]
node scripts/probe-write.mjs W1|W2|W4|…

# 真实账户（默认无头；F2A 自动选渠道：移动推送手机点批准 / 短信终端回传码；
# 自动勾选"信任设备"以签发 refreshToken；--headed 回退有头人工）
node scripts/auth-real.mjs
node scripts/smoke-real.mjs          # 32 项只读核对
node scripts/exp-auth-refresh.mjs    # token 续期链式轮换回归

# 覆盖度审计 / 无头指纹矩阵
node scripts/audit-coverage.mjs
node scripts/exp-fp.mjs
```

旧版 testApp（用户名密码路径 + 代理示例）仍可用：

```bash
node --env-file=.env dist/example/testApp.js
node --env-file=.env dist/example/wsProxyServer.js
```

> **本地代理安全**：`WsJsonServerProxy` 默认无鉴权——本机任意进程都能操控它代理的
> 交易会话。设置 `TOS_PROXY_TOKEN` 后每条代理消息必须携带该 token，不匹配即回
> `{"error":"unauthorized"}` 并断开；未知 request 回 `unknown request`，非法 JSON 回
> `invalid json`。多用户机器与非纯本机回环场景**必须**设置 token。

## 认证流程（2026-10 线上实测，详见 docs/TECHNICAL.md §4）

1. **账密 → authCode**：登录 `https://trade.thinkorswim.com`（或 `/guestpass`）后，
   前端用 oauth `code` 调 `POST tosweb-sm…/api/v1/tsm/authorize`，返回的
   **新 authCode** 才是 wsjson 要的（原始 oauth code 会被 authorize 消费）。
   工具：`src/auth/guestpass.ts`（`waitForTsmAuthorize` 在浏览器导航时截获）。
2. **authCode → token**：WS 连 `login/schwab`（`{authCode, clientId, redirectUri,
tag}`），返回 `token` 与 `accessTokenInfo.refreshToken`。**refreshToken 只在
   F2A 时勾选"信任设备"才签发**；`login` 帧（token 复用登录）响应不含
   accessTokenInfo，收割需抓页面 `login/schwab` 帧（`scripts/auth-real.mjs` 已自动化）。
3. **token → 会话**：`login` 服务复用 token（跨 WS 连接复用，有效期约 24h）。
   真实账户 F2A 登录默认**无头**：脚本自动代填账密、自动勾选信任设备、优先
   "Send a mobile notification"（手机点批准即可），无该渠道退"Text Message"
   （终端回传验证码）。实测 Chrome 155 的 new headless 与有头指纹逐信号一致
   （`scripts/exp-fp.mjs`），默认 stealth 即复刻已验证指纹。
4. ⚠️ **数据中心与 token 绑定**：模拟盘必须连
   `wss://papermoney-services.schwab.com/Services/WsJson`；真实账户连
   `thinkorswim-services`。连错报 `Invalid token (server session id)`。
   门面用 `new RealWsJsonClient({ wsUrl: PAPER_WS_URL })` 选择。

## 支持的 API（全部经线上实测，对账表见 docs/TECHNICAL.md §6）

| 域       | 能力                                                                                                                                                                                                                                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 认证     | access token / authCode；PAPER 与真实双端点；token 跨连接复用；`getAccessToken`（refreshToken 续期通道，scope `"api"`）· `auth_code/get`                                                                                                                                                                                                               |
| 账户     | accounts · statement · positions · margin_calls · disclosures(+/accept) · user_properties(+/set) · order_history · tax_lot(get/update) · transactions/categories                                                                                                                                                                                       |
| 行情     | quotes · quotes/get · chart（extendedHours/priceType/tick，id 可配）· market_depth · market_hours                                                                                                                                                                                                                                                      |
| 期权     | optionSeries · optionSeries/quotes · option_chain/get · quotes/options · options_statistics                                                                                                                                                                                                                                                            |
| 基本面   | fundamentals/current(+history) · studies/get · study/categories（27 类 441 指标）· study/subscribe                                                                                                                                                                                                                                                     |
| 新闻     | news_headers/get · get_relevant · subscribe(_relevant) · news_body                                                                                                                                                                                                                                                                                     |
| 筛选器   | scan_filter/get · scan_filter/parameters · scan_query/get · scan_query/save                                                                                                                                                                                                                                                                            |
| 画图     | drawing/create·update·delete · drawing_set/create·delete · drawing_sets · drawings                                                                                                                                                                                                                                                                     |
| 搜索     | instrument_search · analyst_reports/token                                                                                                                                                                                                                                                                                                              |
| 交易     | **两步下单 CONFIRM→SUBMIT（同草稿 id，库内部处理）** · LIMIT/MARKET/STOP/STOPLIMIT（判别联合）· tif DAY/GTC/EXT/GTC_EXT/AM/PM · 期权腿 · replaceOrder(EDIT_ORDER) · cancel_order · order_history · **orderEvents 原始流 / observeOrders 归一化事件流（status 映射对齐前端官方枚举）** · **guard 安全闸门（paperOnly/账户白名单/数量/名义额，默认关）** |
| 告警     | alerts/create · alerts/cancel · alerts/lookup · alerts/subscribe                                                                                                                                                                                                                                                                                       |
| 自选列表 | watchlist get/categories/create/rename/delete/**add/remove/rearrange**                                                                                                                                                                                                                                                                                 |
| 消息中心 | message_center/get · message_center/subscribe                                                                                                                                                                                                                                                                                                          |
| 其他     | unsubscribe（订阅清理）· 客服聊天（chat/create·close·send_message · support_chat/messages · chat_global/messages）· demo_account(⚠️) · logoff(⚠️)                                                                                                                                                                                                      |

> **连接层内置**（默认开启）：断线指数退避自动重连（0.5s→30s+jitter）、心跳看门狗
> （10s）、握手/登录超时（15s）、重连后活跃流式订阅原样重放；for-await 提前
> break/抛异常自动回收补丁基底并向服务端发 `unsubscribe`（`autoUnsubscribe` 可关）；
> 错误全部为 Error 子类（`WebSocketApiError`/`AuthError`/`TransportError`）。

## 用法

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
  break; // 第一帧即可
}

// 下单（内部两步 CONFIRM→SUBMIT；错误帧会以 WebSocketApiError reject）
try {
  const { body: placed } = await client.placeOrder({
    accountNumber: "<paper-account-code>", // getAccounts() 可查
    symbol: "AAPL",
    quantity: 1,
    limitPrice: 340.0,
  });
  console.log("orderId", placed.orderId);
} catch (e) {
  if (e instanceof WebSocketApiError) console.error("server:", e.message);
}

// 订单事件流：归一化 status（WORKING/FILLED/CANCELED/… 对齐前端官方枚举）
for await (const event of client.observeOrders("<paper-account-code>")) {
  console.log(event.orderId, event.status, event.filledQuantity);
}
```

## 交易安全闸门（可选，默认关闭）

`RealWsJsonClientOptions.guard` 在 confirmOrder/submitOrder/replaceOrder/
cancelOrder 入口前置校验，命中即抛 `GuardError`（Promise reject，wire 上零帧）。
`paperOnly` 判定会话 wsUrl 是否 papermoney 端点；设了 `maxNotionalUsd` 时
MARKET 单（名义金额不可知）保守拒绝：

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

更多见 `src/example/testApp.ts` 与 `scripts/smoke-*.mjs`。

## 已知限制

- 部分服务对 guest 权限受限（news/relevant、screener、tax_lot 深查等）——已在
  真实账户全部回归（`smoke-real.mjs` 32/32）；仅写路径（tax_lot/update、drawing 写、
  saveScanQuery、客服会话写、demo_account）按测试纪律不进真实账户自动化。
- token 自动续期：`Authenticator`（src/auth/authenticator.ts）23h 阈值内经
  `access_token/get`（scope `"api"`）自动换 token，`onTokenRotated` 回调必须持久化
  轮换后的新 refreshToken（一次性轮换，端到端链式续期已验证）。⚠️ 语义注意：
  续期返回的 accessToken 是 **EAT**（供 EAT 鉴权的 REST/服务），不是 wsjson
  `login` 帧用的 32 字符会话 token——会话 token 到期需重新走登录链。
- `market_depth` 真实账户裸 wsjson 会话请求被接受但不推深度帧（页面走带额外订阅
  上下文的大流程）；guest 能收 snapshot。参数正确、非实现缺口，属服务端环境限制。
- 私有协议，服务器 build 会漂移；`pnpm run ci` 与 `scripts/probe-*.mjs` 可随时重新普查。

## License

MIT
