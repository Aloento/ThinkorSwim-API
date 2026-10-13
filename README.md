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

# 认证流程（2026-10 线上实测，见 `agent/06-黑盒实测发现.md`）

1. **账密 → authCode**：登录 `https://trade.thinkorswim.com/guestpass`（或真实入口）后，
   前端用 oauth `code` 调 `POST tosweb-sm…/api/v1/tsm/authorize`，返回的
   **新 authCode** 才是 wsjson 要的（原始 oauth code 会被 authorize 消费）。
   工具：`src/auth/guestpass.ts`（`waitForTsmAuthorize` 在浏览器导航时截获）。
2. **authCode → token**：WS 连 `login/schwab`（`{authCode, clientId, redirectUri, tag}`），
   返回 `token` 与 `accessTokenInfo.refreshToken`（guest 会话无 refreshToken）。
3. **token → 会话**：`login` 服务复用 token（**token 可跨 WS 连接复用，有效期约 24h**）。
4. ⚠️ **数据中心与 token 绑定**：模拟盘（PaperMoney）必须连
   `wss://papermoney-services.schwab.com/Services/WsJson`；真实账户连
   `thinkorswim-services`。连错报 `Invalid token (server session id)`。
   门面用 `new RealWsJsonClient({ wsUrl: PAPER_WS_URL })` 选择。

# 支持的 API（全部经线上实测）

| 域       | 能力                                                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 认证     | access token / authCode；PAPER 与真实双端点；token 跨连接复用                                                                 |
| 账户     | accounts · statement · positions · margin_calls · disclosures · user_properties                                               |
| 行情     | quotes · quotes/get · chart（含 extendedHours/priceType/tick）· market_depth · market_hours                                   |
| 期权     | optionSeries · optionSeries/quotes · option_chain/get · quotes/options · options_statistics                                   |
| 基本面   | fundamentals/current · studies/get · study/categories（441 指标目录）                                                         |
| 新闻     | news_headers/get（相关新闻/relevant 视权限）                                                                                  |
| 搜索     | instrument_search                                                                                                             |
| 交易     | **两步下单 CONFIRM→SUBMIT（同草稿 id，库内部处理）** · replaceOrder(EDIT_ORDER) · cancel_order · order_events · order_history |
| 告警     | alerts/create · alerts/cancel · alerts/lookup · alerts/subscribe                                                              |
| 自选列表 | watchlist get/categories/create/rename/delete/**add/remove/rearrange**                                                        |
| 消息中心 | message_center/get · message_center/subscribe                                                                                 |

# 已知限制

- 部分服务（news/relevant、screener、study/subscribe、tax_lot 深查）对 guest 账号权限受限，
  已在真实账户范围外标注；库 API 仍提供，成功帧待真实账户确认。
- 长连接重连/心跳看门狗/订阅重放正在阶段 1 重构（`agent/05`）。
- 私有协议，服务器 build 会漂移；`pnpm` 脚本与 `agent/tools/probe-*.mjs` 可随时重新普查。

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
```

更多见 `src/example/testApp.ts` 与 `agent/tools/smoke-*.mjs`。

# 运行测试

`pnpm test`

# License

MIT
