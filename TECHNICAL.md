# tos-wsjson-client 技术文档

> 协议为 thinkorswim 网页版逆向所得，非官方支持，服务端随时可能变更。本文只写**当前结论**；
> 复验工具见 §8。

## 目录

1. [项目概览](#1-项目概览)
2. [代码结构](#2-代码结构)
3. [wsjson 线协议](#3-wsjson-线协议)
4. [认证链路](#4-认证链路)
5. [交易链路](#5-交易链路)
6. [API 功能覆盖](#6-api-功能覆盖)
7. [安全闸门与使用纪律](#7-安全闸门与使用纪律)
8. [测试体系与工具](#8-测试体系与工具)
9. [服务端行为要点](#9-服务端行为要点)
10. [已知限制与协议漂移](#10-已知限制与协议漂移)
11. [工程约定](#11-工程约定)

---

## 1. 项目概览

`tos-wsjson-client` 是 thinkorswim 私有 WebSocket API（wsjson）的 Node/浏览器客户端，
基于上游 `huskly/tos-wsjson-client` v0.12.0 重写。

- 工具链：pnpm 12 + TypeScript 7 + Node ≥ 24；`pnpm run ci` = prettier / tsc / eslint / jest。
- 服务目录：`ApiService` 77 个服务名，68 个 handler 全部接入门面（接口 / 真实 / mock /
  代理四面同步）。
- 连接生命周期：指数退避重连（0.5s→30s+jitter）、心跳看门狗 10s、握手与登录超时 15s、
  重连后活跃订阅重放、流提前退出自动 `unsubscribe` 回收。
- 错误类型：`WebSocketApiError` / `AuthError` / `TransportError` / `GuardError`。

该 API 非官方，属 ToS 灰区；实盘自动化必须自带风控闸门（§7）。

## 2. 代码结构

```
src/
├── index.ts                  # 包出口（含 Authenticator 显式命名导出）
├── auth/
│   ├── guestpass.ts          # 登录页收割：tsm/authorize 截获 + token + DC 选择
│   └── authenticator.ts      # token 续期抽象（23h 阈值）
├── client/
│   ├── realWsJsonClient.ts   # 真实客户端：状态机 / 消息回路 / 门面实现
│   ├── mockWsJsonClient.ts   # 形态照线上的 mock
│   ├── wsJsonClient.ts       # WsJsonClient 接口（门面契约单一事实源）
│   ├── wsJsonClientProxy.ts  # 本地代理协议两端（S1 鉴权可选）
│   ├── guard.ts              # 交易安全闸门（paperOnly / 白名单 / 限额）
│   ├── genericIncomingMessageHandler.ts  # snapshot/patch 合并（dataStore）
│   ├── responseRouter.ts     # 响应帧一对多路由（单泵 + 每订阅私有 FIFO）
│   ├── subscriptionStream.ts # 流式订阅门面（提前退出回收）
│   ├── messageTypeHelpers.ts # 帧分类（空 payload 防御）
│   └── services/*.ts         # 68 个 handler：每个 = 一个 wire 服务的参数/响应建模
├── example/testApp.ts
└── test/**
scripts/                      # 黑盒工具（§8）
```

运行时机制：

- **握手**：连接后发 `{ver:"27.*.*", fmt:"json-patches-structured", heartbeat:"2s"}`，
  服务端回 `{session, build, ver}`；此后服务端每 2s 单向推 `{"heartbeat":n}`，客户端无需回包。
- **响应分发**：每帧交 `ResponseRouter.dispatch`，按 `service+id` 匹配（`isResponseForRequest`），
  **复制入队**到每个匹配订阅自己的 FIFO；匹配帧广播给该订阅上所有并发 `next()`。
  订阅在 `sendMessage` 之前建立（响应先到也不丢），settle/break/会话终结即 `close`。
  不变量见 §9.1。
- **snapshot/patch**：`snapshot` 是流全量状态，`patch` 是 RFC6902 增量，`fast-json-patch`
  合并进 `dataStore[service_id]` 基底。一次性请求走 `dispatchOneShot`（断线 reject，不重放）。

## 3. wsjson 线协议

### 3.1 传输层

- 真实端点 `wss://thinkorswim-services.schwab.com/Services/WsJson`；
  模拟盘 `wss://papermoney-services.schwab.com/Services/WsJson`。
  **token 与数据中心绑定**，连错报 `Invalid token (server session id)`。
- 必需请求头：`Origin: https://trade.thinkorswim.com`、`Pragma/Cache-Control: no-cache`、
  标准 WS 升级头、`Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits`。
- **permessage-deflate 必须开启**——关闭会被 1006 断开。
- 帧内全为 JSON 文本帧。

### 3.2 会话生命周期

```
connect ──▶ {ver:"27.*.*", fmt:"json-patches-structured", heartbeat:"2s"}
      ◀── {session, build, ver}            # connectionResponse
      ◀── {"heartbeat":2000}  每 2s 单向
发 login / login/schwab
      ◀── payload[0].body = 登录响应        # 成功后才允许业务请求
业务请求 payload[…]
      ◀── payload[…] (snapshot | patch)    # 可持续推送
```

协议主版本 `27.*.*`；服务端 build 会持续小幅推进，不构成兼容承诺。

### 3.3 消息信封

```jsonc
// 请求
{ "payload": [ { "header": { "service": "…", "id": "…", "ver": 0 },
                 "params": { … } } ] }
// 响应
{ "payload": [ { "header": { "service": "…", "id": "…", "ver": 0,
                             "type": "snapshot" | "patch" | "error" },
                 "body": { … } } ] }
```

- `snapshot`：body 为该 (service,id) 流的完整状态。
- `patch`：`body.patches` = RFC6902 增量，对既有基底 `applyPatch`。
- `error`：`body:{message, isTerminal}` 结构全局一致；错误后服务端常伴
  `unsubscribe/<service>$<requestId>` 快照帧。
- 未注册服务统一回 `{message:"Undefined service: xxx"}`。
- **基底 key 是 `service+id`，不含 ver**：同一 id 至多一条基底，所以 SUBMIT（ver:0）的
  orderId patch 能合并进 CONFIRM（ver:1）的草稿基底。
- 响应 `header.id` 原样回带请求 id —— 这是 id 路由与并发不串台的基础。
- 畸形帧 / 空 payload 有防御，不断流。

### 3.4 响应形态要点

| 服务           | 要点                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------- |
| `quotes`       | snapshot + 持续 patch，`items[].values` 为数值字段；`account` 参数可省略，结果一致        |
| `chart`        | `{symbol, candles:{timestamps[],opens[],highs[],lows[],closes[],volumes[]}}`，六数组等长  |
| `market_depth` | snapshot 即含完整 `askQuotes/bidQuotes`（含 `sizeDecimal`）；真实账户裸会话不推帧（§9.6） |
| `positions`    | snapshot+patch，`items` 含 instrument/values                                              |
| `order_events` | `{service,requestId,orders[],type}`；`orders[]` 必填键含 eventType/orderId/status         |

## 4. 认证链路

### 4.1 两种登录方式

|          | A. token 登录                                          | B. authCode 登录                                                                                 |
| -------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 服务名   | `login`                                                | `login/schwab`                                                                                   |
| params   | `{token, domain:"TOS", platform:"PROD", tag:"TOSWeb"}` | `{authCode, clientId:"TOSWeb", redirectUri:"https://trade.thinkorswim.com/oauth", tag:"TOSWeb"}` |
| 成功判据 | `authenticationStatus === "OK"`                        | `authenticated === true`                                                                         |
| 产出     | 复用同一 token，**响应不含 accessTokenInfo**           | 新 `token` + `accessTokenInfo.refreshToken`（真实账户 F2A 勾"信任设备"时）                       |
| 有效期   | token 跨 WS 连接复用，约 24h                           | authCode 一次性                                                                                  |

### 4.2 浏览器登录链（guest 与真实账户同构）

```
1. GET  https://trade.thinkorswim.com[/guestpass] → sws-gateway 登录 iframe
2. POST https://sws-gateway.thinkorswim.com/api/v2/auth/login   （账密）
   真实账户：第二次 login 返回 control_flow（mobile_approve / sms 通道）
3. POST /api/v2/auth/assert   （F2A 轮询，pending 时 assertion_error_code:13）
4. 302 https://trade.thinkorswim.com/oauth?code=X&session=…
5. POST https://tosweb-sm.thinkorswim.com/api/v1/tsm/authorize  {authCode:X, clientId}
   → 201 {authCode:Y(76字符), eat, eatExpireTime, newT, newTExpireTime}
   wsjson 要的是 Y —— 原始 oauth code 已被 authorize 消费
6. WS login/schwab {authCode:Y,…} → snapshot {token(32字符), accessTokenInfo?}
7. 前端把 token 写入顶层 frame sessionStorage.token（之后可复用）
```

要点：

- oauth 原始 `code` 被前端 `tsm/authorize` 消费，**必须用 authorize 返回的新 authCode**；
  直接拿旧 code 发 `login/schwab` 不可行。
- 收割路径：puppeteer CDP 截 `tsm/authorize` 201 + 页面 WS 帧
  （`Network.webSocketFrameReceived.payloadData`）+ `sessionStorage.token`。
- 数据中心由 `tradingSystem` 决定端点：PaperMoney→papermoney-services，
  LiveTrading→thinkorswim-services。

### 4.3 真实账户 F2A

渠道：`Send a mobile notification` / `Text Message`。`scripts/auth-real.mjs`（默认无头）：

1. 自动勾选**"信任设备"** —— **refreshToken 只在该勾选时签发**（len≈248~268）。
   这是 token 续期能力的前提。
2. 优先移动推送：点选后页面自行轮询 assert，手机上批准，浏览器零操作。
3. 无移动渠道退回短信：页面出验证码输入框，脚本经终端 readline 回传（3 次重试）。
4. `--headed` 回退有头全人工。

无头指纹：Chrome 的 new headless 与有头逐信号一致（UA-CH brands/highEntropy、platform、
plugins、WebGL、`chrome` 对象），唯二差异是 `navigator.webdriver` 与 UA 里的
`HeadlessChrome` token，默认 stealth 插件即抹平。**不要手写 UA/UA-CH/时区覆盖**——
手写值与真实 Chrome 的 `platformVersion`/brand 版本对不上反而制造内部不一致。

### 4.4 token 续期（Authenticator）

- 续期通道：wsjson 服务 `access_token/get {refreshToken, scope, clientId}`。
- **scope 合法值为 `"api"`**（`"GENERAL"` 报 `Unrecognized scope`；候选集
  `api/authentication/authz-api/analyticsapi/update`）。
- 轮换返回 `{accessExpiresIn:86400, accessToken, refreshToken}`：
  - **refreshToken 一次性**：轮换后旧值立即失效，`onTokenRotated` 回调必须持久化新值，
    否则丢续期能力。链式续期（用新 RT 再续下一次）已验证。
  - **两种 token 不可互换**：续期出的 `accessToken` 是 **EAT**（855+ 字符、`S0.` 前缀，
    供 EAT 鉴权的 REST），**不是** wsjson `login` 帧用的 32 字符会话 token；拿 EAT 走
    login 帧报 `Invalid token (server session id)`。会话 token 到期需重走登录链。
- `Authenticator.getValidToken()`：23h 阈值内直通，到期走续期；guest 无 refreshToken
  → 直通 + warn 一次。

## 5. 交易链路

### 5.1 两段式下单

```
CONFIRM: place_order  ver:1  action:"CONFIRM"   id: "update-draft-order-<SYM>"
SUBMIT : place_order  ver:0  action:"SUBMIT"    必须复用同一 header.id
```

- 草稿态由服务端按 `service+id` 保存；**换 id 提交报
  "Can not submit while prices are not available!"**。
- 服务端有权改写草稿价（$1 限价被对齐到 mid）。
- `orderId` 从 SUBMIT 后的 patch `/orders/0/orderId` 返回（跨 ver 合并进 ver:1 草稿基底，
  门面 `body.orderId` 直接可见）；终态判据：合并后 `body.orders[0].orderId > 0`。
- `replaceOrder`：`requestType:EDIT_ORDER + refOrderId`。
  `cancelOrder`：`{orderId}`；重复撤单 → error 帧
  `has already been cancelled or is in a final state`（isTerminal:true）。

### 5.2 订单类型与 tif

- 判别联合参数：`MARKET`（无价格键）/ `LIMIT`（limitPrice）/ `STOP`（仅 stopPrice）/
  `STOPLIMIT`（双价）。**wire 枚举是 `STOPLIMIT`（无下划线）**；门面 API 用
  `STOP_LIMIT`，由 buildRequest 映射。
- wire 订单类型全集（snapshot `types.values`）：`MARKET LIMIT STOP STOPLIMIT
TRAILSTOP TRAILSTOPLIMIT MOC LOC`（错误帧扩至 CANCEL/WALK_LIMIT/EXERCISE/…）。
- `tifs.values`：`[DAY, GTC, EXT, GTC_EXT, AM, PM]`（WEEK/EXTENDED 不存在）。
- 期权腿：`optionSeries → option_chain/get(seriesNames)` 拿真实合约
  （wire 带前导点、strike 可小数，如 `.AAPL261014C337.5`）→ `legs[].symbol` 直传。

### 5.3 碎股（名义额）买单

真实机制：**MARKET 单 + `legs.quantity` 传小数**，不需要任何专用订单类型或标志。
已成交样本：`BUY +0.0394 SCHP MKT` FILLED ≈$1.00。

- 无 `AMOUNT` orderType（草稿即拒 `"STOCK order may not have AMOUNT type."`）；
  legs 也无 `amount` 字段——legs 只接受
  `[symbol, positionEffect, quantity, taxLotMethod]`。
- **`isNotional` 不可用**：CONFIRM 阶段带必拒（"can be set to true only at the SUBMIT
  stage"）；SUBMIT 阶段带它 paper 端接受但**不兑现**——`quantity:2` 按 2 整股成交，
  静默错量。`quantityLink=MONEY_AMOUNT` 同样不用（legs 带 quantity 即拒）。
- **最低 $1 名义额**（券商原文："Buy notional/Fractional orders can only be placed with
  minimum of $1 and out to two decimal places"），且 **quantity 小数位 ≤4**
  （0.0004 被拒 "…more than 4 decimals"，0.001 通过）。
- 换算 `qty = floor(usd/price × 1e4)/1e4` —— **向下**取整，保证实付 ≤ 计划名义额
  （花钱只能少不能多）。floor 后若跌破 $1（计划额贴下限的极端配置）回退 ceil，
  因为 $1 是券商硬约束。
- **paper 端碎股语义不可信**（接受 isNotional、按整股成交），碎股只能在 live 验证。

### 5.4 订单事件流与状态归一化

- `orderEvents({account, types?})`：原始 `body.orders[]` 流。
- `observeOrders(account)`：归一化 `NormalizedOrderEvent` 流。status 映射逐分支复刻前端
  bundle 的官方归一函数（20 个 raw wire 值 → WORKING / WAIT_TRG / WAIT_STOP / WAIT_COND /
  WAIT_REV / CANCELED / EXPIRED / REJECTED / FILLED / NONE；`WAIT TRG ≡ WAIT_TRG`；
  default 分支子串嗅探兜底）。
- **官方词表无 "PARTIAL"**：部分成交由 `eventType:EXECUTION + filledQuantity` 表达，
  status 仍 WORKING。wire 原值保留在 `rawStatus`，未识别归 NONE 不丢事件。
- 前端去重键 `${orderId}_${eventType}`。
- `order_history` 是权威回读通道：`order_events` 流可能整场零事件，超时不等于未成交。

## 6. API 功能覆盖

> **PASS** = 端到端跑通；**REAL** = 真实账户只读回归通过或按业务响应定性；
> **IMPL** = 服务与参数经校验帧/bundle 双证据实现，缺真实成功帧（权限或纪律限制，非实现缺口）；
> **DANGER** = 危险写操作（库提供，自动化冒烟绝不调用）。

| 网页功能       | wsjson 服务                                                                                | 门面方法                                                                                                                                    | 状态                                                    |
| -------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 登录/会话      | login, login/schwab, access_token/get, auth_code/get, logoff/schwab                        | authenticateWithAccessToken / authenticateWithAuthCode / getAccessToken / getAuthCode / logoff(DANGER)                                      | PASS REAL；续期链式轮换 PASS                            |
| 账户概览/余额  | accounts, statement, user_properties, margin_calls, disclosures                            | getAccounts / getStatement / userProperties / getMarginCalls / getDisclosures                                                               | PASS（margin_calls 现金账户业务拒 = b 类）              |
| 持仓/订单簿    | positions, order_events, order_history, workingOrders                                      | getPositions / orderEvents+observeOrders / getOrderHistory / workingOrders                                                                  | PASS REAL                                               |
| 行情报价       | quotes, quotes/get                                                                         | quotes(流) / getQuotes(一次性)                                                                                                              | PASS                                                    |
| K 线图表       | chart                                                                                      | chart（extendedHours/priceType/tick/id 可配）                                                                                               | PASS                                                    |
| 盘口深度       | market_depth                                                                               | marketDepth                                                                                                                                 | PASS（REAL 裸会话不推帧 = c 类，§9.6）                  |
| 交易时段       | market_hours                                                                               | getMarketHours（参数 `markets`+`date`，非 exchanges）                                                                                       | PASS                                                    |
| 期权链/到期    | optionSeries, optionSeries/quotes, option_chain/get                                        | optionChain / optionChainQuotes / optionChainDetails                                                                                        | PASS（optionChain 响应体是 `body.series[]`）            |
| 期权行情/统计  | quotes/options, options_statistics                                                         | optionQuotes（参数 `underlyingSymbol`） / subscribeOptionsStatistics                                                                        | PASS                                                    |
| 指标目录/叠加  | studies/get, study/categories, study/subscribe                                             | getStudies / getStudyCategories（27 类 441 项） / subscribeStudies（元素必带 `aggregationPeriod`，24 值枚举）                               | PASS REAL                                               |
| 基本面         | fundamentals/current, fundamentals/history                                                 | getFundamentals（time ∈ [QUARTERLY, ANNUAL]） / getFundamentalsHistory（**无 time 参数**，fields 仅 21 个 historical 字段）                 | PASS REAL                                               |
| 新闻面板       | news_headers/get, get_relevant, subscribe(_relevant), news_body                            | getNews / getRelevantNews / subscribeNews / subscribeRelevantNews / newsBody                                                                | PASS REAL（guest 权限拒 = b 类）                        |
| 品种搜索       | instrument_search                                                                          | searchInstruments                                                                                                                           | PASS                                                    |
| 下单/改单/撤单 | place_order(CONFIRM/SUBMIT/EDIT), cancel_order                                             | placeOrder / confirmOrder / submitOrder / replaceOrder / cancelOrder（可选 guard）                                                          | PASS（写用例已验）                                      |
| 告警中心       | alerts/create, cancel, lookup, subscribe                                                   | createAlert / cancelAlert / lookupAlerts / subscribeAlerts                                                                                  | PASS REAL（create/cancel 真实账户禁写未测）             |
| 自选列表全套   | watchlist/get, categories, create, rename, delete, add, remove, rearrange                  | watchlist / getWatchlists / createWatchlist / renameWatchlist / deleteWatchlist / addToWatchlist / removeFromWatchlist / rearrangeWatchlist | PASS（watchlistId 必须用 create 返回的真实 id）         |
| 消息中心       | message_center/get, subscribe                                                              | getMessageCenter / subscribeMessageCenter                                                                                                   | PASS                                                    |
| 全局聊天/客服  | chat_global/messages, support_chats, chat/create·close·send_message, support_chat/messages | subscribeGlobalChats / getSupportChats / createChat / closeChat / sendChatMessage / getSupportChatMessages                                  | PASS REAL（chat_global 无订阅版，AsyncIterable 包单帧） |
| 画线工具       | drawing*, drawing_sets, drawings                                                           | createDrawing / updateDrawing / deleteDrawing / createDrawingSet / deleteDrawingSet / getDrawingSets / getDrawings                          | REAL；drawing 写参数 guest 不可达 = c 类，IMPL          |
| 股票筛选器     | scan_filter/get, parameters, scan_query/get, save                                          | getScanFilters / getScanFilterParameters / getScanQuery / saveScanQuery(DANGER)                                                             | REAL（guest "server error" = c 类）                     |
| 税务成本基础   | tax_lot/get, tax_lot/update                                                                | getTaxLots / updateTaxLot(DANGER；`refreshToken` 参数是分页游标非 auth token)                                                               | REAL，IMPL                                              |
| 交易分类       | transactions/categories                                                                    | getTransactionCategories（6 参数，§9.5）                                                                                                    | PASS REAL                                               |
| 分析师报告     | analyst_reports/token                                                                      | getAnalystReportsToken                                                                                                                      | PASS REAL                                               |
| 订阅清理       | unsubscribe                                                                                | unsubscribe（流 break 自动发，autoUnsubscribe 可关）                                                                                        | PASS                                                    |
| 演示账户调额   | demo_account/set_balance, adjust_cash                                                      | demoAccountSetBalance(DANGER) / demoAccountAdjustCash(DANGER)                                                                               | IMPL（真实账户禁写）                                    |

**不存在的服务名**（均回 "Undefined service"）及真实对应：`user_preferences`、`social_view`、
`screeners`→scan_query/scan_filter 系列、`news`→news_headers/get、
`fundamental_history`→fundamentals/current、`trans_history`→transactions/categories、
`watchlist/get_all`、`account_history`→order_history、`tax_lots`→tax_lot/get、
`order_preview`、`predict/quotes/options`、`quotes/options/centered`。

## 7. 安全闸门与使用纪律

### 7.1 库内 guard（`src/client/guard.ts`）

`RealWsJsonClientOptions.guard?: {paperOnly, allowedAccountCodes, maxQuantity, maxNotionalUsd}`
在 confirm/submit/replace/cancelOrder 入口前置校验，命中即 **Promise reject（GuardError），
wire 上零帧**。

- `paperOnly`：判定会话 wsUrl 是否含 `papermoney-services`。
- `maxNotionalUsd`：设置时 **MARKET 单一律保守拒绝**（库口径下其名义额不可知）。
  需要按美元把关的调用方应在 CONFIRM 回读后自校验（Schwab-DCA 即如此，语义更强）。
- `cancelOrder` 仅受 paperOnly 约束。
- 默认关闭，零行为变化。

### 7.2 测试纪律（写在工具代码里，不是口号）

- 测试流量默认打模拟盘；**真实账户只允许只读**（smoke-real 全量只读、无 logoff）。
- `probe-write.mjs` 硬闸门：非 papermoney 端点直接 exit(3)；$1 限价 1 股白名单标的；
  MARKET 单只 CONFIRM 永不 SUBMIT。
- 真实账户禁写清单：下单/改单/撤单、watchlist 写、logoff、demo_account、
  setUserProperties、acceptDisclosures、saveScanQuery、drawing 写、tax_lot/update、客服会话写。
- 凭据只放 gitignored 的 `scripts/.env.blackbox`；证据落盘（artifacts）前统一脱敏，
  token/authCode/账户号一律正则打码。

### 7.3 本地代理安全（WsJsonServerProxy）

默认无鉴权——本机任意进程可操控代理的交易会话。设 `TOS_PROXY_TOKEN` 后每条代理消息必须
携带该 token（不匹配回 `{"error":"unauthorized"}` 并断开）；未知 request 回
`unknown request`（ALL_REQUESTS 白名单），非法 JSON 回 `invalid json`。
多用户机器与非纯本机回环场景**必须**设置 token。

## 8. 测试体系与工具

```
L0 匿名探针      无凭据     握手/心跳/帧格式/build 号       随时可跑
L1 认证生命周期  需凭据     登录/token 过期/refresh/F2A      低频（token 宝贵）
L2 只读服务普查  模拟盘     全部读服务请求-响应录制          改版后复跑
L3 写操作验证    仅模拟盘   下单/改单/撤单/告警/自选闭环     手动触发
L4 真实账户冒烟  真实账户   只读白名单（32 项）              极低频、只读
```

凭据模板 `scripts/.env.blackbox.example` → 复制为 `scripts/.env.blackbox`；
录制产物落 `scripts/artifacts/`，浏览器 profile 落 `scripts/puppeteer-data*`，均 gitignored。

| 工具                   | 层  | 用途                                                                          |
| ---------------------- | --- | ----------------------------------------------------------------------------- |
| `probe-ws.mjs`         | L0  | 匿名握手探针（无凭据）：`node scripts/probe-ws.mjs 10000`                     |
| `auth-guest.mjs`       | L1  | guestpass 登录收割 token：`node scripts/auth-guest.mjs <user> <pass>`         |
| `auth-real.mjs`        | L1  | 真实账户登录（默认无头，F2A 自动选渠道+信任设备，收割 token/refreshToken）    |
| `probe-login.mjs`      | L1  | 裸协议：新鲜 authCode 走 login/schwab，dump 脱敏响应                          |
| `probe-services.mjs`   | L2  | 只读服务普查 30+ 项，原始帧录制：`node scripts/probe-services.mjs [service…]` |
| `probe-write.mjs`      | L3  | 写用例 W 组（paper 硬闸门）：`node scripts/probe-write.mjs W1 \| W2 \| …`     |
| `smoke-lib.mjs`        | L3  | 编译库 API 端到端冒烟（22 断言，含 watchlist 写闭环与流式可达）               |
| `smoke-order.mjs`      | L3  | 下单冒烟：$1 限价 1 股 + 自动撤单（paper；账户运行时从 accounts 现取）        |
| `smoke-real.mjs`       | L4  | 真实账户 32 项只读核对（判定口径 §9.7）                                       |
| `exp-auth-refresh.mjs` | L1  | Authenticator 端到端链式续期回归                                              |
| `exp-fp.mjs`           | L1  | 无头/有头 × raw/stealth 指纹矩阵（§4.3 依据）                                 |
| `audit-coverage.mjs`   | —   | handler 接线覆盖度审计（refs 计数）                                           |

单元测试：`pnpm test`（真实线帧回放、连接生命周期、guard 拦截矩阵、order 归一 34 组映射、
dataStore 生命周期、持久订阅与分发回归、Authenticator 等）。

## 9. 服务端行为要点

### 9.1 响应分发：单泵 + 每订阅私有 FIFO

帧路由必须把匹配帧**复制**入队到每个匹配订阅的私有队列，无人等待则留在该订阅自己的队列。

- **点对点队列上不能叠 filter-then-discard**：消费式队列（`next()` 即 shift）+ 丢弃不匹配帧
  的组合，会让任何"不该在此等待"的消费者（提前 break 的流、被 error 终止的订阅留下的悬挂
  `next()`）变成永久帧黑洞——它拉走后续每帧并扔掉，真正的收件人永远挂起。
  触发条件极常见：`for await … break` 后在同 socket 上发起下一个请求。
- 会话终结时 `endAll()` 释放所有悬挂取数者。
- 回归测试 `src/test/client/fanOutRegression.test.ts`。

### 9.2 服务端持久订阅：重复 subscribe 被静默忽略

`statement`、`positions`、`order_events` 是**服务端持久订阅**：首帧 snapshot 后服务端不销毁
该订阅（后续还推 patch）。于是同会话内第二次以同 `service$id` 订阅会被当作重复订阅
**静默忽略——不回任何帧，连 `type:"error"` 都没有**。Promise 型门面因此会永久 await，
且没有任何错误信号（现场表现为静默挂死，比报错危险得多）。

`quotes/get`、`accounts`、`market_hours` 的订阅服务端自灭，重复调用正常。

由此三条是硬性要求，不是建议：

1. 持久订阅同会话内同 id 只能订阅一次；要再读**必须先退订**（退订帧先于新 subscribe
   到达即可，服务端按到达序处理——TCP 保证同 socket 的帧序）。
2. 一次性读语义的门面必须**读完即退订**（`dispatchOneShot` 的 `releaseSubscription`，
   settle 时同步发退订帧）。
3. **写单路径绝不可退订**：CONFIRM 的草稿订阅（`place_order$update-draft-order-<SYM>`）
   必须活到 SUBMIT 完成帧，它还要承载服务端异步注入的价格 patch。

哪些服务是持久订阅只以录制为准，不猜。回归测试
`src/test/client/persistentSubscription.test.ts`（假服务端复刻订阅存活语义；关掉修复即超时失败）。

调用方纵深防御：所有**只读**调用自设 deadline（沉默即失败）；写路径不设超时——
"可能已下单"的状态不能凭超时判负。

### 9.3 两种 login 的响应形状不同

`login`（token 复用）响应**没有** accessTokenInfo，guest 与真实账户都如此；
`accessTokenInfo.refreshToken` 只出现在页面首帧 `login/schwab`，收割必须抓这一帧。

### 9.4 续期出的是 EAT，不是会话 token

`access_token/get` 要求 scope=`"api"`；轮换出的 accessToken 是 EAT（`S0.` 前缀、
accessExpiresIn=86400），供 EAT 鉴权 REST。wsjson 的 32 字符会话 token 生命周期独立，
到期重走登录链。refreshToken 一次性，`onTokenRotated` 必须持久化。

### 9.5 transactions/categories 必须 6 参数

只发 `{account}` 报 `Unexpected error during validation`。完整形状
`{account, startTime, endTime, transactionCategories?, cryptoTransactionTypes?,
cashFutureTransactionTypes?}`（后三可空数组）。

### 9.6 market_depth 在真实账户裸会话不推帧

请求被接受（错误帧自曝可用参数 `[symbol, refreshRate]`，只发 symbol 无错误帧）但不推深度帧；
相同参数 guest 能收 snapshot。页面走 `marketDepth-trade-page-chart` 大流程带额外订阅上下文。
属服务端环境限制，非实现缺口。

### 9.7 冒烟结果判定三分类

- **(a) 真 bug**：参数姿势正确仍失败 → 修 handler。
- **(b) 权限/业务拒**：`You are not permitted`、现金账户 `no margin account` → 文档化，非 API 缺口。
- **(c) 服务端错/不推帧**：参数正确但环境限制（§9.6、guest 的 scan_query）→ 分类记录。
  判读口径：错误帧 = 失败；纯超时 = 环境限制。

### 9.8 参数口径速查

| 服务                 | 常见误用                          | 正确口径                                                                                                                                                          |
| -------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| chart                | `includeExtendedHours`            | `extendedHours`；可用参数 [priceType, timeAggregation, extendedHours, studies, symbol, startAtMarketOpen, range, cryptoMidnightUtc, tickAggregation, refreshRate] |
| market_hours         | `exchanges`                       | `[date, markets]`，markets ∈ {EQUITY, OPTION, FUTURE}                                                                                                             |
| market_hours 用途    | 用 `EQUITY.EQ.isOpen` 当交易闸门  | `isOpen` 盘前也为 true，只表示当日开市（排除节假日/临时休市）。正常时段判断看 `sessionHours.regularMarket` 窗口                                                   |
| quotes               | 硬编码 account:"COMBINED ACCOUNT" | 可省略，结果一致                                                                                                                                                  |
| fundamentals/history | 带 `time`                         | 仅 `{symbol, fields}`；time 是前端网关层剥的，wsjson 直接拒                                                                                                       |
| order_history        | —                                 | account 要**真实 code**（非 COMBINED ACCOUNT），startTime/endTime **epoch 秒**，窗口 ≤370 天                                                                      |
| order_events 状态    | 以为有 PARTIAL                    | 官方词表无 PARTIAL（由 EXECUTION + filledQuantity 表达）                                                                                                          |
| 下单版本             | 笼统称"ver 1→ver 0 两段式"        | CONFIRM ver:1 / SUBMIT ver:0 **同 id**，差异在 action/requestType                                                                                                 |
| 自选成分修改         | 猜测服务名                        | `watchlist/add`、`watchlist/remove`、`watchlist/rearrange`                                                                                                        |
| login 响应           | quotePermissions 当对象           | 是**数组**；新增 isCryptoSignupEligible/isPdtHidden；userDomain 仍回 "TDA"（遗留字段）                                                                            |
| study/subscribe      | 省略字段                          | 元素须 `{name, aggregationPeriod:"DAY", parameters:{}}`；缺字段报 `must not be null`，`parameters` 省略也报错；`plot` 传值被拒不发。枚举 24 值（MIN1…YEAR）       |

### 9.9 错误帧机制

`header.type:"error"` + `body:{message, isTerminal}` 结构全局一致，库统一转
`WebSocketApiError` reject/throw。`unsubscribe` 是独立服务名（推送 `service$id`），
流提前退出时库自动发送。

## 10. 已知限制与协议漂移

- **协议私有且会漂移**：服务名、参数、枚举、错误结构都可能变。发现渠道：`pnpm run ci`
  - 定期重跑 `probe-services.mjs`/`smoke-lib.mjs` 对比录制。目标：协议变更后 1 天内由
    测试矩阵发现，而不是由实盘业务发现。
- **bot 检测风险**：WS 连接目前不校验浏览器指纹，但非浏览器环境未来可能被拦；UA/origin
  可配。真实账户登录走真实浏览器栈（§4.3）。
- **guest 权限边界**：news/relevant、screener、tax_lot 等对 guest 受限，已在真实账户回归；
  写路径按纪律（§7.2）不进真实账户自动化。
- **observeOrders status 归一**以 bundle 官方映射为准，新状态归 `NONE` 不丢事件。
- **`pnpm ci` 陷阱**：pnpm v12 裸 `pnpm ci` 是 install 别名（假绿）；验证一律 `pnpm run ci`。
- **TDA 遗留**：login 响应仍带 `userDomain:"TDA"` 等字段，解析需宽松；认证入口已完全是
  Schwab OAuth 单通道。

## 11. 工程约定

- 提交小而聚焦，文档与代码同 PR；`pnpm exec prettier --write` 后再提交（CI 第一关是
  prettier --check）。
- 门面契约单一事实源在 `src/client/wsJsonClient.ts` 接口；新增服务四面同步
  （接口 / 真实 / mock / 代理）+ index 导出 + 冒烟断言。
- 下单草稿 id 规则（CONFIRM/SUBMIT 同 id）与 `service$id` 基底 key 是 wire 契约，勿改。
- 未录制确认的字段不猜测修改；错误帧自曝的枚举是权威来源，全量抄录进类型。
- 测试凭据与录制产物永不入库（`.gitignore`：`.env.*`、`scripts/artifacts/`、
  `scripts/puppeteer-data*/`；工具内建脱敏落盘）。
- 登录页 DOM 可能漂移：auth 工具选择器都有"找不到表单"降级路径；真实账户登录失败先
  `--headed` 人工复核再改代码。
- 本文与代码注释只写**当前结论**；排查过程、时间线、run id 属工程日志，进 commit
  message，不进本文。
