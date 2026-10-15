# thinkorswim WsJson API client

> 中文 · [English](README.en.md)

Node 和浏览器可用的 thinkorswim 私有 WebSocket API 客户端。基于上游
`huskly/tos-wsjson-client` v0.12.0 现代化：pnpm + TypeScript 7 + Node 24，
全部服务经线上黑盒实测校正。协议细节、服务参数与实测结论见
[TECHNICAL.md](TECHNICAL.md)。

> ⚠️ 嘉信国际（Charles Schwab International）不提供开发者账户，如需程序化交易
> 请优先评估官方 API。本仓库使用的 wsjson 是网页版内部协议，非官方支持，服务器
> 随时可能变更；当前实现已在实盘验证通过，但不保证今后持续可用。使用实盘账户
> 自动化请务必自带风控。

## 前置要求

- Node ≥ 24（pnpm 12 经 corepack 自动启用）

## 构建

```bash
corepack enable
pnpm install
pnpm build          # tsc → dist/
pnpm test           # jest（含真实线帧回放测试）
pnpm run ci         # prettier + build + lint + test
```

## 黑盒工具（scripts/）

凭据：复制 `scripts/.env.blackbox.example` 为 `scripts/.env.blackbox` 并填写。

```bash
# 匿名握手探针（无需凭据）
node scripts/probe-ws.mjs 10000

# 模拟盘：登录收割 token → 端到端冒烟 → 下单/撤单冒烟（$1 限价 1 股自动撤）
node scripts/auth-guest.mjs <user> <pass>
node scripts/smoke-lib.mjs
node scripts/smoke-order.mjs

# 只读服务普查 / 写用例（仅限模拟盘，工具内置硬闸门）
node scripts/probe-services.mjs [service ...]
node scripts/probe-write.mjs W1|W2|W4|…

# 真实账户（默认无头登录；F2A 自动处理：移动推送在手机上批准，
# 或短信验证码在终端输入；--headed 回退有头人工）
node scripts/auth-real.mjs
node scripts/smoke-real.mjs          # 只读冒烟
node scripts/exp-auth-refresh.mjs    # token 续期回归

# 覆盖度审计 / 无头指纹矩阵
node scripts/audit-coverage.mjs
node scripts/exp-fp.mjs
```

旧版示例（用户名密码路径 + 本地代理）：

```bash
node --env-file=.env dist/example/testApp.js
node --env-file=.env dist/example/wsProxyServer.js
```

> 本地代理默认无鉴权，本机任意进程都可操控它代理的会话。设置
> `TOS_PROXY_TOKEN` 后每条代理消息必须携带该 token，否则直接断开。共享机器或
> 非本机回环场景必须设置。

## 认证流程（详见 TECHNICAL.md §4）

1. 登录 `https://trade.thinkorswim.com`（或 `/guestpass`）后，前端用 oauth
   `code` 调 `tsm/authorize` 换发新 authCode——wsjson 要的是这个新 authCode，
   原始 oauth code 已被 authorize 消费。
2. WS 连 `login/schwab` 用 authCode 换 32 字符会话 token；F2A 时勾选"信任设备"
   才会签发 refreshToken。
3. 会话 token 跨 WS 连接复用（约 24h）。真实账户 F2A 支持全自动无头登录
   （`scripts/auth-real.mjs`）。
4. token 与数据中心绑定：模拟盘必须连
   `wss://papermoney-services.schwab.com/Services/WsJson`，真实账户连
   `thinkorswim-services`，连错报 `Invalid token (server session id)`。
   门面用 `new RealWsJsonClient({ wsUrl: PAPER_WS_URL })` 选择。

## 能力一览（对账表见 TECHNICAL.md §6）

| 域       | 能力                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| 认证     | access token / authCode 登录；`getAccessToken` 续期；`auth_code/get`                                              |
| 账户     | 账户/对账单/持仓/保证金追缴/披露/用户属性/成交历史/税务批/交易分类                                                |
| 行情     | 报价流与一次性报价 · K 线 · 盘口深度 · 交易时段                                                                   |
| 期权     | 期权链 · 链上报价 · 链详情 · 期权统计                                                                             |
| 基本面   | 基本面当前/历史 · 指标目录（441 项）· 指标数值订阅                                                                |
| 新闻     | 新闻头/相关性新闻/正文/订阅                                                                                       |
| 筛选器   | 筛选条件与参数 / 查询                                                                                             |
| 画线     | 画线增删改 · 画线组                                                                                               |
| 搜索     | 品种搜索 · 分析师报告                                                                                             |
| 交易     | 限价/市价/止损/止损限价单（内部两步 CONFIRM→SUBMIT）· 改单撤单 · 订单事件流（原始 + 归一化 status）· 交易安全闸门 |
| 告警     | 创建/取消/查询/订阅                                                                                               |
| 自选列表 | 建列/改名/删除/增删成分/重排                                                                                      |
| 消息中心 | 拉取/订阅                                                                                                         |
| 其他     | 订阅清理 · 客服会话 · 演示账户调额(⚠️) · logoff(⚠️)                                                               |

连接层内置：断线指数退避重连、心跳看门狗、握手/登录超时、重连后订阅重放；
`for-await` 提前退出自动向服务端发 `unsubscribe`；错误均为 Error 子类
（`WebSocketApiError` / `AuthError` / `TransportError` / `GuardError`）。

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

// 下单（内部两步 CONFIRM→SUBMIT；服务端报错以 WebSocketApiError reject）
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

// 订单事件流：归一化 status（WORKING/FILLED/CANCELED/…）
for await (const event of client.observeOrders("<paper-account-code>")) {
  console.log(event.orderId, event.status, event.filledQuantity);
}
```

## 交易安全闸门（可选，默认关闭）

`RealWsJsonClientOptions.guard` 在下单/改单/撤单入口前置校验，违规即抛
`GuardError`，请求不会发出：

```typescript
const client = new RealWsJsonClient({
  wsUrl: PAPER_WS_URL,
  guard: {
    paperOnly: true, // 仅允许模拟盘端点
    allowedAccountCodes: ["<paper-account-code>"],
    maxQuantity: 100,
    maxNotionalUsd: 5000,
  },
});
```

更多见 `src/example/testApp.ts` 与 `scripts/smoke-*.mjs`。

## 已知限制

- **碎股（名义额）买单的唯一可靠形状是 MARKET + `legs.quantity` 小数**（live
  实测定案，TECHNICAL.md §5.2）：无 `AMOUNT` 类型；`isNotional` 是陷阱（CONFIRM
  阶段必拒，SUBMIT 阶段 paper 接受但按整股成交）；最低 $1、小数位 ≤4。paper 端
  碎股语义与真实端不同，不可用于验证。
- 部分服务对 guest 会话权限受限（新闻相关性、筛选器、税务批深查等），真实账户
  正常；写类接口按测试纪律未做真实账户自动化。
- token 自动续期（`src/auth/authenticator.ts`）经 `access_token/get` 换发的
  accessToken 是 EAT，不用于 wsjson 登录帧；会话 token 到期需重走登录链。
  refreshToken 为一次性轮换，`onTokenRotated` 回调里必须持久化新值。
- `market_depth` 在真实账户裸会话中请求被接受但不推深度帧（页面走带额外订阅
  上下文的流程）；guest 可收 snapshot。
- 私有协议会漂移：服务器 build 持续迭代，服务参数、枚举、错误结构都可能变化。
  用 `pnpm run ci` 与 `scripts/probe-services.mjs` 可随时重新普查。
