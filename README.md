# thinkorswim WsJson API client

Node 和浏览器可用的 thinkorswim 私有 WebSocket API 客户端（黑盒逆向）。
基于上游 `huskly/tos-wsjson-client` v0.12.0 现代化重构：pnpm + TypeScript 7 + Node 24，
所有服务经 2026-10 线上黑盒实测校正。

🚧 仍属早期（协议私有、随时可能漂移），但核心交易/行情/账户链路已端到端跑通真实模拟盘。 🚧

# 前置要求

- Node ≥ 24（推荐；`packageManager` 为 pnpm 12，经 corepack 自动启用）

# 构建（Node）

```bash
corepack enable
pnpm install
pnpm build          # tsc → dist/
pnpm test           # jest（含真实线帧回放测试）
pnpm ci             # prettier + build + lint + test 四关
```

# 运行示例（guest 模拟盘冒烟）

```bash
# 1) 用 guestpass 账号登录并把 token 写入 agent/tools/.env.blackbox
node agent/tools/auth-guest.mjs <user> <pass>
# 2) 端到端冒烟（真实服务器）
node agent/tools/smoke-lib.mjs
# 下单/撤单冒烟（$1 限价 1 股，随后自动撤单）
node agent/tools/smoke-order.mjs
```

旧版 testApp（用户名密码路径 + 代理示例）仍可用：

```bash
node --env-file=.env dist/example/testApp.js
node --env-file=.env dist/example/wsProxyServer.js
```

> **本地代理安全（S1/S3）**：`WsJsonServerProxy` 默认无鉴权——本机任意进程
> 都能操控它代理的交易会话。设置环境变量 `TOS_PROXY_TOKEN` 后，每条代理
> 消息必须携带该 token（`WsJsonClientProxy` 构造第三参传 `{ authToken }`
> 自动附带，`wsProxyClient` 读同名 env），不匹配即回
> `{"error":"unauthorized"}` 并断开；未设置保持旧行为（信任本机）。
> 未知 `request` 一律回 `{"error":"unknown request"}`（ALL_REQUESTS 白名单，
> 此前静默挂起），非法 JSON 回 `{"error":"invalid json"}`（此前
> unhandled rejection）。多用户机器与任何非纯本机回环场景**必须**设置 token。

# 认证流程（2026-10 线上实测，见 `agent/06-黑盒实测发现.md`）

1. **账密 → authCode**：登录 `https://trade.thinkorswim.com/guestpass`（或真实入口）后，
   前端用 oauth `code` 调 `POST tosweb-sm…/api/v1/tsm/authorize`，返回的
   **新 authCode** 才是 wsjson 要的（原始 oauth code 会被 authorize 消费）。
   工具：`src/auth/guestpass.ts`（`waitForTsmAuthorize` 在浏览器导航时截获）。
2. **authCode → token**：WS 连 `login/schwab`（`{authCode, clientId, redirectUri, tag}`），
   返回 `token` 与 `accessTokenInfo.refreshToken`（guest 会话无 refreshToken；
   **真实账户也只在 F2A 时勾选"信任设备"才签发 refreshToken**——第九轮实测，
   `login` 帧（token 复用登录）响应不含 accessTokenInfo，收割需抓页面
   `login/schwab` 帧，工具 `agent/tools/auth-real.mjs` 已自动化）。
3. **token → 会话**：`login` 服务复用 token（**token 可跨 WS 连接复用，有效期约 24h**）。
   真实账户 F2A 登录（`agent/tools/auth-real.mjs`）为半自动交接：脚本自动代填
   账密，出现 F2A 页后由用户在弹出的浏览器完成手机验证/勾选信任设备。
4. ⚠️ **数据中心与 token 绑定**：模拟盘（PaperMoney）必须连
   `wss://papermoney-services.schwab.com/Services/WsJson`；真实账户连
   `thinkorswim-services`。连错报 `Invalid token (server session id)`。
   门面用 `new RealWsJsonClient({ wsUrl: PAPER_WS_URL })` 选择。

# 支持的 API（全部经线上实测）

| 域       | 能力                                                                                                                                                                                                                                                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 认证     | access token / authCode；PAPER 与真实双端点；token 跨连接复用；`getAccessToken`（refreshToken 续期通道）· `auth_code/get`                                                                                                                                                                                                                                                                   |
| 账户     | accounts · statement · positions · margin_calls · disclosures(+/accept) · user_properties(+/set) · order_history · tax_lot(get/update)                                                                                                                                                                                                                                                      |
| 行情     | quotes · quotes/get · chart（含 extendedHours/priceType/tick，id 可配）· market_depth · market_hours                                                                                                                                                                                                                                                                                        |
| 期权     | optionSeries · optionSeries/quotes · option_chain/get · quotes/options · options_statistics                                                                                                                                                                                                                                                                                                 |
| 基本面   | fundamentals/current(+history) · studies/get · study/categories（441 指标目录）· study/subscribe                                                                                                                                                                                                                                                                                            |
| 新闻     | news_headers/get · get_relevant · subscribe(_relevant) · news_body（relevant 视权限）                                                                                                                                                                                                                                                                                                       |
| 筛选器   | scan_filter/get · scan_filter/parameters · scan_query/get · scan_query/save                                                                                                                                                                                                                                                                                                                 |
| 画图     | drawing/create·update·delete · drawing_set/create·delete · drawing_sets · drawings                                                                                                                                                                                                                                                                                                          |
| 搜索     | instrument_search · analyst_reports/token                                                                                                                                                                                                                                                                                                                                                   |
| 交易     | **两步下单 CONFIRM→SUBMIT（同草稿 id，库内部处理）** · LIMIT/MARKET/STOP/STOPLIMIT（判别联合，多余价格键类型层拦截）· tif DAY/GTC/EXT/GTC_EXT/AM/PM · 期权腿（合约代码直传）· replaceOrder(EDIT_ORDER) · cancel_order · order_history · **orderEvents 原始流 / observeOrders 归一化事件流（status 映射对齐前端官方枚举）** · **guard 安全闸门（paperOnly/账户白名单/数量/名义额，默认关）** |
| 告警     | alerts/create · alerts/cancel · alerts/lookup · alerts/subscribe（subscribeAlerts 事件流）                                                                                                                                                                                                                                                                                                  |
| 自选列表 | watchlist get/categories/create/rename/delete/**add/remove/rearrange**                                                                                                                                                                                                                                                                                                                      |
| 消息中心 | message_center/get · message_center/subscribe                                                                                                                                                                                                                                                                                                                                               |
| 其他     | unsubscribe（订阅清理）· 客服聊天（chat/create·close·send_message · support_chat/messages · chat_global/messages）· demo_account(⚠️) · logoff(⚠️)                                                                                                                                                                                                                                           |

> **连接层内置**（默认开启）：断线指数退避自动重连（0.5s→30s+jitter）、心跳看门狗（10s）、
> 握手/登录超时（15s）、重连后活跃流式订阅原样重放；for-await 提前 break/抛异常自动回收
> 补丁基底并向服务端发 `unsubscribe`（`autoUnsubscribe` 可关）；错误全部为 Error 子类
> （`WebSocketApiError`/`AuthError`/`TransportError`）。

# 已知限制

- 部分服务（news/relevant、screener、study/subscribe、tax_lot 深查、scan_query、
  transactions/categories）对 guest 账号权限受限——**第九轮已在真实账户全部回归**
  （`agent/tools/smoke-real.mjs` 32/32，见 `agent/06` 第九轮）；guest 受限项均确认为
  权限/环境问题而非实现缺口。仅写路径（tax_lot/update、drawing 写、saveScanQuery、
  客服会话写、demo_account）按纪律不进真实账户自动化。
- token 自动续期：`Authenticator`（src/auth/authenticator.ts）已落地——23h 阈值内经
  `access_token/get`（scope `"api"`，真实账户实测值）自动换 token，`onTokenRotated`
  回调必须持久化轮换后的新 refreshToken（一次性轮换，端到端链式续期已验证，
  `agent/tools/exp-auth-refresh.mjs`）。guest 无 refreshToken（直通并 warn 一次）。
  ⚠️ 语义注意：续期返回的 accessToken 是 **EAT**（供 EAT 鉴权的 REST/服务），不是
  wsjson `login` 帧用的 32 字符会话 token——会话 token 到期需重新走登录链。
- `observeOrders` 的 status 归一化以前端 bundle 官方映射表为准；真实账户 orderEvents
  流首帧可达（smoke-real 实测），wire 原值始终保留在 `rawStatus`，未识别新状态归
  `NONE` 不丢事件。
- 私有协议，服务器 build 会漂移；`pnpm run ci` 与 `agent/tools/probe-*.mjs` 可随时重新普查
  （注意 pnpm v12 里裸 `pnpm ci` 是 install 别名假绿）。

# 用法

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
}

// 下单（内部两步；错误帧会以 WebSocketApiError reject）
try {
  const { body: placed } = await client.placeOrder({
    accountNumber: "D-12345678",
    symbol: "AAPL",
    quantity: 1,
    limitPrice: 340.0,
  });
  console.log("orderId", placed.orderId);
} catch (e) {
  if (e instanceof WebSocketApiError) console.error("server:", e.message);
}

// 订单事件流：归一化 status（WORKING/FILLED/CANCELED/... 对齐前端官方枚举）
for await (const event of client.observeOrders("D-12345678")) {
  console.log(event.orderId, event.status, event.filledQuantity);
}
```

# 交易安全闸门（可选，默认关闭）

`RealWsJsonClientOptions.guard` 在 confirmOrder/submitOrder/replaceOrder/
cancelOrder 入口前置校验，命中即抛 `GuardError`（Promise reject，wire 上
零帧）。`paperOnly` 判定会话 wsUrl 是否 papermoney 端点；设了
`maxNotionalUsd` 时 MARKET 单（名义金额不可知）保守拒绝：

```typescript
const client = new RealWsJsonClient({
  wsUrl: PAPER_WS_URL,
  guard: {
    paperOnly: true,
    allowedAccountCodes: ["D-12345678"],
    maxQuantity: 100,
    maxNotionalUsd: 5000,
  },
});
```

更多见 `src/example/testApp.ts` 与 `agent/tools/smoke-*.mjs`。

# 运行测试

`pnpm test`

# License

MIT
