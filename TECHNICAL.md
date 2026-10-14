# tos-wsjson-client 技术文档

> 协议为网页版逆向所得，非官方支持，服务器随时可能变更；任何"实测结论"都应视为
> **当时线上行为的快照**，用 `scripts/probe-*.mjs` 可随时复验。

---

## 目录

1. [项目概览](#1-项目概览)
2. [代码结构](#2-代码结构)
3. [wsjson 线协议](#3-wsjson-线协议)
4. [认证链路（实测口径）](#4-认证链路实测口径)
5. [交易链路](#5-交易链路)
6. [API 功能覆盖（功能对账）](#6-api-功能覆盖功能对账)
7. [安全闸门与使用纪律](#7-安全闸门与使用纪律)
8. [黑盒测试体系与工具](#8-黑盒测试体系与工具)
9. [关键实测发现汇编](#9-关键实测发现汇编)
10. [已知限制与协议漂移风险](#10-已知限制与协议漂移风险)
11. [工程约定](#11-工程约定)

---

## 1. 项目概览

`tos-wsjson-client` 是 thinkorswim 网页版私有 WebSocket API（wsjson）的
Node/浏览器客户端，基于上游 `huskly/tos-wsjson-client` v0.12.0 现代化：

- 工具链：pnpm 12 + TypeScript 7 + Node ≥ 24，CI 四关（prettier / tsc / eslint / jest）。
- 全部服务经线上黑盒实测校正：guest（PaperMoney）会话 + 真实账户只读回归。
- 服务目录：`ApiService` 77 个服务名、68 个 handler 类全部接入门面
  （接口 / 真实实现 / mock / 双向代理四面同步）。
- 库内置连接生命周期：指数退避重连（0.5s→30s+jitter）、心跳看门狗（10s）、
  握手/登录超时（15s）、重连后活跃订阅原样重放、流提前退出自动
  `unsubscribe` 回收、错误全部为 `Error` 子类
  （`WebSocketApiError` / `AuthError` / `TransportError` / `GuardError`）。

> ⚠️ 该 API 非官方，ToS 政策灰区。实盘自动化必须自带风控闸门（见 §7）。

## 2. 代码结构

```
src/
├── index.ts                  # 包出口（含 Authenticator 显式命名导出）
├── auth/
│   ├── guestpass.ts          # guest 登录辅助：tsm/authorize 截获 + token 收割 + DC 选择
│   └── authenticator.ts      # token 自动续期抽象（23h 阈值，见 §4.4）
├── client/
│   ├── realWsJsonClient.ts   # 真实客户端：状态机/消息回路/门面实现
│   ├── mockWsJsonClient.ts   # 形态照线上的 mock
│   ├── wsJsonClient.ts       # WsJsonClient 接口（门面契约单一事实源）
│   ├── wsJsonClientProxy.ts  # 本地代理协议两端（S1 鉴权可选）
│   ├── guard.ts              # 交易安全闸门（paperOnly/白名单/限额）
│   ├── genericIncomingMessageHandler.ts  # snapshot/patch 合并核心（dataStore）
│   ├── subscriptionStream.ts # 流式订阅门面（提前退出回收）
│   ├── messageTypeHelpers.ts # 帧分类（payload 空防御）
│   └── services/*.ts         # 68 个服务 handler（每个=一个 wire 服务的参数/响应建模）
├── example/testApp.ts        # 用户名密码路径 + 代理示例 + guest 冒烟
└── test/**                   # jest：帧回放 / 连接生命周期 / guard / 归一化 等
scripts/                      # 黑盒工具（见 §8）
TECHNICAL.md                  # 本文
```

核心运行时机制：

- **消息回路**：连接后先发协议握手 `{ver:"27.*.*", fmt:"json-patches-structured",
heartbeat:"2s"}` → 服务器回 `{session, build, ver}`；此后服务器每 2s 单向推
  `{"heartbeat":n}`（客户端无需回包）。
- **请求分发**：每个业务请求带 `header.id`，响应条目**原样回带 id**，路由按
  `service + id`（+ 跨 ver 基底查找）关联，并发订阅互不串台。
- **Observable 模型**：请求得到 Observable；`snapshot` 帧是流全量状态，
  `patch` 帧是 RFC6902 JSON Patch 增量，`fast-json-patch` 合并进
  `dataStore[service_id]` 基底；一次性请求用 `dispatchOneShot`（断线 reject 不重放）。

## 3. wsjson 线协议

### 3.1 传输层

- 端点：真实 `wss://thinkorswim-services.schwab.com/Services/WsJson`；
  模拟盘 `wss://papermoney-services.schwab.com/Services/WsJson`
  （**token 与数据中心绑定**，连错报 `Invalid token (server session id)`）。
- 必须请求头（伪造浏览器环境）：`Origin: https://trade.thinkorswim.com`、
  `Pragma/Cache-Control: no-cache`、标准 WS 升级头、
  `Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits`。
- **permessage-deflate 必须开启**（实测关闭被 1006 踢掉，勿"优化"掉它）。
- 帧内全部为 JSON 文本帧。

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

服务器 build 实测已到 `27.2640.4-Q3`（协议主版本 `27.*.*` 一年未变）。

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
- `error`：`body:{message, isTerminal}` 全局一致；错误后服务端常伴
  `unsubscribe/<service>$<requestId>` 快照帧。
- 未注册服务统一回 `{message:"Undefined service: xxx"}`。
- **基底跨 ver 命中**：`service+id` 为基底 key，同一 id 至多一条
  基底——SUBMIT（ver:0）的 orderId patch 能正确合并进 CONFIRM（ver:1）草稿基底。

### 3.4 响应形态要点（实测）

| 服务           | 形态要点                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------- |
| `quotes`       | snapshot + 持续 patch，`items[].values` 数值字段；`account` 参数可省略（结果一致）        |
| `chart`        | `{symbol, candles:{timestamps[],opens[],highs[],lows[],closes[],volumes[]}}` 六数组等长   |
| `market_depth` | snapshot 即含完整 `askQuotes/bidQuotes`（含 `sizeDecimal`）；真实账户裸会话不推帧（§9.8） |
| `positions`    | snapshot+patch，`items` 含 instrument/values                                              |
| `order_events` | `{service,requestId,orders[],type}`；orders[] 必填键含 eventType/orderId/status/…         |

## 4. 认证链路（实测口径）

### 4.1 两种登录方式

|          | A. token 登录                                          | B. authCode 登录                                                                                 |
| -------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 服务名   | `login`                                                | `login/schwab`                                                                                   |
| params   | `{token, domain:"TOS", platform:"PROD", tag:"TOSWeb"}` | `{authCode, clientId:"TOSWeb", redirectUri:"https://trade.thinkorswim.com/oauth", tag:"TOSWeb"}` |
| 成功判据 | `authenticationStatus === "OK"`                        | `authenticated === true`                                                                         |
| 产出     | 复用同一 token（**响应不含 accessTokenInfo**）         | 新 `token` + `accessTokenInfo.refreshToken`（真实账户 F2A 勾"信任设备"时）                       |
| 有效期   | token 跨 WS 连接复用，约 24h                           | authCode 一次性                                                                                  |

### 4.2 浏览器侧完整登录链（guest 与真实账户同构）

```
1. GET  https://trade.thinkorswim.com[/guestpass] → sws-gateway 登录 iframe
2. POST https://sws-gateway.thinkorswim.com/api/v2/auth/login   （账密）
   真实账户：第二次 login 返回 control_flow（mobile_approve / sms 通道）
3. POST /api/v2/auth/assert   （F2A 轮询，pending 时 assertion_error_code:13）
4. 302 https://trade.thinkorswim.com/oauth?code=X&session=…
5. POST https://tosweb-sm.thinkorswim.com/api/v1/tsm/authorize  {authCode:X, clientId}
   → 201 {authCode:Y(76字符), eat, eatExpireTime, newT, newTExpireTime}
   ★ Y 才是 wsjson 要的 authCode——原始 oauth code 已被 authorize 消费
6. WS login/schwab {authCode:Y,…} → snapshot {token(32字符), accessTokenInfo?}
7. 前端把 token 写入顶层 frame sessionStorage.token（wsjson 之后可复用）
```

要点：

- oauth 原始 `code` 会被前端 `tsm/authorize` 消费；**wsjson 需要 authorize 返回的新
  authCode**（上游库用旧 code 直发 login/schwab 已不可行）。
- 收割路径：puppeteer CDP 截 `tsm/authorize` 201 + 页面 WS 帧
  （`Network.webSocketFrameReceived` 的 **`payloadData`** 字段）+ `sessionStorage.token`。
- 数据中心选择：`tradingSystem` 决定端点——PaperMoney→papermoney-services，
  LiveTrading→thinkorswim-services。

### 4.3 真实账户 F2A（第二因子）

F2A 页面提供渠道：`Send a mobile notification` / `Text Message`。
`scripts/auth-real.mjs`（默认无头）自动处理：

1. 自动勾选**"信任设备"**——**refreshToken 只在该勾选时签发**（实测两次未勾选的
   登录 CDP 抓不到 refreshToken；勾选后 login/schwab 帧
   `accessTokenInfo.refreshToken` 出现，len≈248~268）。
2. 优先移动推送：点选后页面自行轮询 assert，人在手机上点批准，浏览器零操作。
3. 无移动渠道退回短信：页面出验证码输入框，脚本经终端 readline 回传验证码填入
   （3 次重试）。
4. `--headed` 回退有头全人工。

无头指纹口径（`scripts/exp-fp.mjs` 矩阵实测）：Chrome 155 的 **new headless 与有头
逐信号一致**（UA-CH brands/highEntropy、platform、plugins、WebGL、chrome 对象全同），
唯二差异 `navigator.webdriver` 与 UA 里的 "HeadlessChrome" token——默认
puppeteer-extra-plugin-stealth 即抹平。**不要手写 UA/UA-CH/时区覆盖**：手写值与真实
Chrome 的 `platformVersion`/brand 版本对不上反而制造内部不一致，正是风控抓的点。

### 4.4 token 自动续期（Authenticator）

- 续期通道：wsjson 服务 `access_token/get {refreshToken, scope, clientId}`。
- **scope 合法值实测为 `"api"`**（"GENERAL" 报 `Unrecognized scope`；候选集来自
  bundle EAT scope 枚举 `api/authentication/authz-api/analyticsapi/update`）。
- 轮换返回 `{accessExpiresIn:86400, accessToken, refreshToken}`：
  - **refreshToken 一次性**：每次轮换旧值立即失效，`onTokenRotated` 回调必须
    持久化新值——端到端链式续期（用 #1 的新 RT 再续 #2）已验证。
  - **两种 token 语义不同**：续期出的 `accessToken` 是 **EAT**（855+ 字符，`S0.` 前缀，
    供 EAT 鉴权的 REST/其他系统），**不是** wsjson `login` 帧用的 32 字符会话
    token；拿 EAT 走 login 帧报 `Invalid token (server session id)`。
    wsjson 会话 token 到期需重走登录链。
- `Authenticator.getValidToken()`：23h 阈值内直通，到期走续期；guest 无
  refreshToken → 直通 + warn 一次。

## 5. 交易链路

### 5.1 两段式下单（实测协议）

```
CONFIRM: place_order  ver:1  action:"CONFIRM"   id: "update-draft-order-<SYM>"
SUBMIT : place_order  ver:0  action:"SUBMIT"    ★ 必须复用同一 header.id
```

- 草稿态由服务端按 `service+id` 保存；**换 id 提交报
  "Can not submit while prices are not available!"**。
- 服务端有权改写草稿价（$1 限价被对齐到 mid=340.95）。
- `orderId` 从 SUBMIT 后的 patch `/orders/0/orderId` 返回（跨 ver 合并进 ver:1
  草稿基底，门面 `body.orderId` 直接可见）；终态判据：合并后
  `body.orders[0].orderId > 0`。
- `replaceOrder`：`requestType:EDIT_ORDER + refOrderId`；`cancelOrder`：
  `{orderId}`，重复撤单 → error 帧 `has already been cancelled or is in a final state`
  （isTerminal:true）。

### 5.2 订单类型与 tif（错误帧自曝 + CONFIRM 实测）

- 判别联合参数：`MARKET`（无价格键）/ `LIMIT`（limitPrice）/ `STOP`（仅
  stopPrice）/ `STOPLIMIT`（双价）。**wire 枚举是 `STOPLIMIT`（无下划线）**，
  门面 API 用 `STOP_LIMIT`，buildRequest 映射。
- wire 订单类型全集（snapshot `types.values`）：`MARKET LIMIT STOP STOPLIMIT
TRAILSTOP TRAILSTOPLIMIT MOC LOC`（错误帧扩至 CANCEL/WALK_LIMIT/EXERCISE/…）。
- `tifs.values` 实测 `[DAY, GTC, EXT, GTC_EXT, AM, PM]`（WEEK/EXTENDED
  不存在）。
- 期权腿：`optionSeries → option_chain/get(seriesNames)` 拿真实合约
  （wire 带前导点、strike 可小数，如 `.AAPL261014C337.5`）→ `legs[].symbol` 直传。

### 5.3 订单事件流与状态归一化

- `orderEvents({account, types?})`：原始 `body.orders[]` 流。
- `observeOrders(account)`：归一化 `NormalizedOrderEvent` 流。status 映射**逐分支
  复刻前端 bundle 官方归一函数**（20 raw wire 值 → WORKING / WAIT_TRG / WAIT_STOP /
  WAIT_COND / WAIT_REV / CANCELED / EXPIRED / REJECTED / FILLED / NONE；
  `WAIT TRG ≡ WAIT_TRG` 空格下划线等价；default 分支子串嗅探兜底）。
- **官方词表无 "PARTIAL"**：部分成交经 `eventType:EXECUTION + filledQuantity`
  表达，status 仍 WORKING。wire 原值保留 `rawStatus`，未识别归 NONE 不丢事件。
- 前端去重键 `${orderId}_${eventType}`。

## 6. API 功能覆盖（功能对账）

> ✅=真实服务器端到端实测通过；REAL=真实账户只读回归通过或按业务响应定性；
> 🔧=服务与参数经校验帧/bundle 双证据实现，缺真实成功帧（权限/纪律限制，非实现缺口）；
> ⚠️=危险写操作（库提供，自动化冒烟绝不调用）。

| 网页功能       | wsjson 服务                                                                                | 门面方法                                                                                                                                    | 状态                                                                |
| -------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 登录/会话      | login, login/schwab, access_token/get, auth_code/get, logoff/schwab                        | authenticateWithAccessToken / authenticateWithAuthCode / getAccessToken / getAuthCode / logoff⚠️                                            | ✅ REAL 全链路；续期链式轮换 ✅（RT 需 F2A 勾信任设备）             |
| 账户概览/余额  | accounts, statement, user_properties, margin_calls, disclosures                            | getAccounts / getStatement / userProperties / getMarginCalls / getDisclosures                                                               | ✅（margin_calls 现金账户业务拒=分类 b）                            |
| 持仓/订单簿    | positions, order_events, order_history, workingOrders                                      | getPositions / orderEvents+observeOrders / getOrderHistory / workingOrders                                                                  | ✅ REAL                                                             |
| 行情报价       | quotes, quotes/get                                                                         | quotes(流) / getQuotes(一次性)                                                                                                              | ✅                                                                  |
| K 线图表       | chart                                                                                      | chart（extendedHours/priceType/tick/id 可配）                                                                                               | ✅                                                                  |
| 盘口深度       | market_depth                                                                               | marketDepth                                                                                                                                 | ✅（REAL 裸会话不推帧=分类 c，§9.8）                                |
| 交易时段       | market_hours                                                                               | getMarketHours（参数是 `markets`+`date`，不是 exchanges！）                                                                                 | ✅                                                                  |
| 期权链/到期    | optionSeries, optionSeries/quotes, option_chain/get                                        | optionChain / optionChainQuotes / optionChainDetails                                                                                        | ✅（optionChain 响应体是 `body.series[]`）                          |
| 期权行情/统计  | quotes/options, options_statistics                                                         | optionQuotes（参数 `underlyingSymbol`） / subscribeOptionsStatistics                                                                        | ✅                                                                  |
| 指标目录/叠加  | studies/get, study/categories, study/subscribe                                             | getStudies / getStudyCategories（27 类 441 项） / subscribeStudies（元素必带 `aggregationPeriod`，24 值枚举）                               | ✅ REAL（subscribe snapshot SMA=336.28）                            |
| 基本面         | fundamentals/current, fundamentals/history                                                 | getFundamentals（time ∈ [QUARTERLY, ANNUAL]） / getFundamentalsHistory（**无 time 参数**，fields 仅 21 个 historical 字段）                 | ✅ REAL                                                             |
| 新闻面板       | news_headers/get, get_relevant, subscribe(_relevant), news_body                            | getNews / getRelevantNews / subscribeNews / subscribeRelevantNews / newsBody                                                                | ✅ REAL（relevant 真实账户 news=5；guest 权限拒=分类 b）            |
| 品种搜索       | instrument_search                                                                          | searchInstruments                                                                                                                           | ✅                                                                  |
| 下单/改单/撤单 | place_order(CONFIRM/SUBMIT/EDIT), cancel_order                                             | placeOrder / confirmOrder / submitOrder / replaceOrder / cancelOrder（可选 guard）                                                          | ✅（写用例实测）                                                    |
| 告警中心       | alerts/create, cancel, lookup, subscribe                                                   | createAlert / cancelAlert / lookupAlerts / subscribeAlerts                                                                                  | ✅ REAL（lookup snapshot；create/cancel 真实账户禁写未测）          |
| 自选列表全套   | watchlist/get, categories, create, rename, delete, add, remove, rearrange                  | watchlist / getWatchlists / createWatchlist / renameWatchlist / deleteWatchlist / addToWatchlist / removeFromWatchlist / rearrangeWatchlist | ✅（闭环冒烟；watchlistId 必须用 create 返回的真实 id）             |
| 消息中心       | message_center/get, subscribe                                                              | getMessageCenter / subscribeMessageCenter                                                                                                   | ✅                                                                  |
| 全局聊天/客服  | chat_global/messages, support_chats, chat/create·close·send_message, support_chat/messages | subscribeGlobalChats / getSupportChats / createChat / closeChat / sendChatMessage / getSupportChatMessages                                  | ✅ REAL（写侧禁写未测；chat_global 无订阅版，AsyncIterable 包单帧） |
| 画线工具       | drawing*, drawing_sets, drawings                                                           | createDrawing / updateDrawing / deleteDrawing / createDrawingSet / deleteDrawingSet / getDrawingSets / getDrawings                          | ✅ REAL（sets snapshot；drawing 写参数 guest 不可达=分类 c，🔧）    |
| 股票筛选器     | scan_filter/get, parameters, scan_query/get, save                                          | getScanFilters / getScanFilterParameters / getScanQuery / saveScanQuery⚠️                                                                   | ✅ REAL（guest "server error"=分类 c 已确认；save 禁写未测）        |
| 税务成本基础   | tax_lot/get, tax_lot/update                                                                | getTaxLots / updateTaxLot⚠️（`refreshToken` 参数是分页游标非 auth token）                                                                   | 🔧 REAL 可达（业务级响应非参数 bug）                                |
| 交易分类       | transactions/categories                                                                    | getTransactionCategories（6 参数，§9.6）                                                                                                    | ✅ REAL（equityTransactions=93）                                    |
| 分析师报告     | analyst_reports/token                                                                      | getAnalystReportsToken                                                                                                                      | ✅ REAL                                                             |
| 订阅清理       | unsubscribe                                                                                | unsubscribe /（流 break 自动发，autoUnsubscribe 可关）                                                                                      | ✅                                                                  |
| 演示账户调额   | demo_account/set_balance, adjust_cash                                                      | demoAccountSetBalance⚠️ / demoAccountAdjustCash⚠️                                                                                           | 🔧（真实账户禁写）                                                  |

**不存在的服务名（常见猜测，均回 "Undefined service"）**：`user_preferences, social_view, screeners, news,
fundamental_history, trans_history, watchlist/get_all, account_history, tax_lots,
order_preview, predict/quotes/options, quotes/options/centered`
（真实对应：news→news_headers/get、fundamental_history→
fundamentals/current、tax_lots→tax_lot/get、account_history→order_history、
trans_history→transactions/categories、screeners→scan_query/scan_filter 系列）。

## 7. 安全闸门与使用纪律

### 7.1 库内 guard（`src/client/guard.ts`）

`RealWsJsonClientOptions.guard?: {paperOnly, allowedAccountCodes, maxQuantity,
maxNotionalUsd}` 在 confirm/submit/replace/cancelOrder 入口前置校验，命中即
**Promise reject（GuardError），wire 上零帧**。`paperOnly` 判定会话 wsUrl 是否含
`papermoney-services`；设了 `maxNotionalUsd` 时 MARKET 单（名义额不可知）保守拒绝；
`cancelOrder` 仅受 paperOnly 约束。默认关闭，零行为变化。

### 7.2 测试纪律（写进工具代码，不是文档口号）

- 测试流量默认打模拟盘；**真实账户只允许只读**（smoke-real 全量只读、无 logoff）。
- `probe-write.mjs` 硬闸门：非 papermoney 端点直接 exit(3)；$1 限价 1 股白名单标的；
  MARKET 单只 CONFIRM 永不 SUBMIT。
- 真实账户禁写清单：下单/改单/撤单、watchlist 写、logoff、demo_account、
  setUserProperties、acceptDisclosures、saveScanQuery、drawing 写、tax_lot/update、
  客服会话写。
- 凭据只放 gitignored 的 `scripts/.env.blackbox`；证据落盘（artifacts）前统一脱敏，
  token/authCode/账户号一律正则打码。

### 7.3 本地代理安全（WsJsonServerProxy）

默认无鉴权——本机任意进程可操控代理的交易会话。设 `TOS_PROXY_TOKEN` 后每条代理
消息必须携带该 token（不匹配回 `{"error":"unauthorized"}` 并断开）；未知 request
回 `unknown request`（ALL_REQUESTS 白名单），非法 JSON 回 `invalid json`。
多用户机器与非纯本机回环场景**必须**设置 token。

## 8. 黑盒测试体系与工具

分层：

```
L0 匿名探针      无凭据     握手/心跳/帧格式/build 号       随时可跑
L1 认证生命周期  需凭据     登录/token 过期/refresh/F2A      低频（token 宝贵）
L2 只读服务普查  模拟盘     全部读服务请求-响应录制          改版后复跑
L3 写操作验证    仅模拟盘   下单/改单/撤单/告警/自选闭环     手动触发
L4 真实账户冒烟  真实账户   只读白名单（32 项）              极低频、只读
```

`scripts/` 固化工具（凭据模板 `scripts/.env.blackbox.example`，复制为
`scripts/.env.blackbox` 填写；录制产物落 `scripts/artifacts/`，浏览器 profile 落
`scripts/puppeteer-data*`，均 gitignored）：

| 工具                   | 层  | 用途与用法                                                                    |
| ---------------------- | --- | ----------------------------------------------------------------------------- |
| `probe-ws.mjs`         | L0  | 匿名握手探针（无凭据）：`node scripts/probe-ws.mjs 10000`                     |
| `auth-guest.mjs`       | L1  | guestpass 登录收割 token：`node scripts/auth-guest.mjs <user> <pass>`         |
| `auth-real.mjs`        | L1  | 真实账户登录（默认无头，F2A 自动选渠道+信任设备，收割 token/refreshToken）    |
| `probe-login.mjs`      | L1  | 裸协议：新鲜 authCode 走 login/schwab，dump 脱敏响应                          |
| `probe-services.mjs`   | L2  | 只读服务普查 30+ 项，原始帧录制：`node scripts/probe-services.mjs [service…]` |
| `probe-write.mjs`      | L3  | 写用例 W 组（paper 硬闸门）：`node scripts/probe-write.mjs W1 \| W2 \| …`     |
| `smoke-lib.mjs`        | L3  | 编译库 API 端到端冒烟（22 断言，含 watchlist 写闭环与流式可达）               |
| `smoke-order.mjs`      | L3  | 下单冒烟：$1 限价 1 股 + 自动撤单（paper；账户运行时从 accounts 现取）        |
| `smoke-real.mjs`       | L4  | 真实账户 32 项只读核对（判定矩阵见 §9.9）                                     |
| `exp-auth-refresh.mjs` | L1  | Authenticator 端到端链式续期回归（一次性 RT 轮换证明）                        |
| `exp-fp.mjs`           | L1  | 无头/有头 × raw/stealth 指纹矩阵（§4.3 依据）                                 |
| `audit-coverage.mjs`   | —   | handler 接线覆盖度审计（refs 计数）                                           |

单元测试：`pnpm test`（112 用例：真实线帧回放、连接生命周期、guard 拦截矩阵、
order 归一 34 组映射、dataStore 生命周期、Authenticator 等）。

## 9. 关键实测发现汇编

### 9.1 两种 login 服务响应形状不同

wsjson `login` 帧（token 复用登录）响应**没有** accessTokenInfo——guest 与真实账户
都如此；带 `accessTokenInfo.refreshToken` 的是 **`login/schwab`** 帧（页面首帧）。
收割 refreshToken 必须抓页面 `login/schwab` 帧（CDP `payloadData`）。

### 9.2 refreshToken 只在 F2A 勾选"信任设备"时签发

未勾选抓不到；勾选后 login/schwab 帧出现（len≈248~268）。这是 Authenticator
续期能力的前提。

### 9.3 access_token/get：scope="api"，轮换出的是 EAT

"GENERAL" 报 `Unrecognized scope`。续期出的 accessToken 是 **EAT**（855+ 字符
`S0.` 前缀，accessExpiresIn=86400），供 EAT 鉴权 REST；**不是** wsjson 登录用的
32 字符会话 token——二者生命周期独立，会话 token 到期重走登录链。

### 9.4 refreshToken 一次性轮换（链式已验证）

每次轮换旧值立即失效；用新值再续成功证明新 RT 已激活。`onTokenRotated`
必须持久化，否则丢续期能力。

### 9.5 oauth code 一次性 + tsm/authorize 换发

原始 oauth `code` 被前端 authorize 消费；wsjson 用的是 authorize **响应里的新
authCode**。

### 9.6 transactions/categories 必须 6 参数

只发 `{account}` 报 `Unexpected error during validation`（真 bug 修复）：完整形状
`{account, startTime, endTime, transactionCategories?, cryptoTransactionTypes?,
cashFutureTransactionTypes?}`（后三可空数组），真实账户 snapshot 93 条。

### 9.7 study/subscribe 元素必带 aggregationPeriod

`{name, aggregationPeriod:"DAY", parameters:{}}`；缺字段报 `must not be null`，
枚举 24 值（MIN1…YEAR）。注意这不是权限问题——guest 同样可用，缺字段才报错。
`parameters` 省略反而报服务端错（保守必填）；`plot` 传值被拒不发。

### 9.8 market_depth 真实账户裸会话不推帧（分类 c）

请求被接受（错误帧自曝可用参数 `[symbol, refreshRate]`，只发 symbol 无错误帧），
但不推深度帧——页面走 `marketDepth-trade-page-chart` 大流程带额外订阅上下文；
相同参数 guest 能收 snapshot。非实现缺口，属服务端环境限制。

### 9.9 结果判定三分类（冒烟判读口径）

- **(a) 真 bug**：参数姿势正确仍失败 → 修 handler（如 9.6/9.7）。
- **(b) 权限/业务拒**：`You are not permitted` / 现金账户 `no margin account` →
  文档化，不是 API 缺口。
- **(c) 服务端错/不推帧**：参数正确但环境限制（9.8、guest 的 scan_query）→
  分类记录；"错误帧=失败、纯超时=环境限制"。

### 9.10 参数口径速查（易踩坑处）

| 服务                 | 常见误用                          | 实测口径                                                                                                                                                          |
| -------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| chart                | `includeExtendedHours` ❌         | `extendedHours`；可用参数 [priceType, timeAggregation, extendedHours, studies, symbol, startAtMarketOpen, range, cryptoMidnightUtc, tickAggregation, refreshRate] |
| market_hours         | `exchanges` ❌                    | `[date, markets]`（markets=["EQUITY","OPTION","FUTURE"]）                                                                                                         |
| quotes               | 硬编码 account:"COMBINED ACCOUNT" | 可省略，结果一致（已移除硬编码）                                                                                                                                  |
| fundamentals/history | 带 `time` ❌                      | 仅 `{symbol, fields}`；time 是前端网关层剥的，wsjson 直接拒                                                                                                       |
| order_history        | —                                 | account 要**真实 code**（非 COMBINED ACCOUNT），startTime/endTime **epoch 秒**，窗口 ≤370 天                                                                      |
| order_events 状态    | 以为有 PARTIAL                    | 官方词表无 PARTIAL（EXECUTION+filledQuantity 表达）                                                                                                               |
| 下单版本             | 笼统称"ver 1→ver 0 两段式"        | 准确口径：CONFIRM ver:1 / SUBMIT ver:0 **同 id**，差异在 action/requestType                                                                                       |
| 自选成分修改         | 猜测服务名                        | 实名 `watchlist/add`、`watchlist/remove`、`watchlist/rearrange`（猜测名均 "Undefined service"）                                                                   |
| login 响应           | quotePermissions 对象             | 已变**数组**；新增 isCryptoSignupEligible/isPdtHidden；userDomain 仍回 "TDA"（遗留字段）                                                                          |

### 9.11 错误帧机制与协议鲁棒性

- `header.type:"error"` + `body:{message, isTerminal}` 全局一致；库统一转
  `WebSocketApiError` reject/throw。
- 响应 header.id 与请求 id 原样回带 → id 路由可行（并发不串台的基础）。
- `unsubscribe` 是独立服务名（推送 `service$id`），流提前退出时库自动发送。
- 垃圾帧/空 payload 防御齐备（畸形帧不断流，有测试）。

## 10. 已知限制与协议漂移风险

- **协议私有且会漂移**：服务器 build 一年从 27.2323.x 走到 27.2640.4。服务名、
  参数、枚举、错误结构都可能变。发现渠道：`pnpm run ci` + 定期重跑
  `probe-services.mjs`/`smoke-lib.mjs` 对比。目标：线上改协议后 1 天内由测试
  矩阵先发现，而不是实盘业务发现。
- **bot 检测（Akamai 等）风险**：WS 连接目前不校验浏览器指纹，但非浏览器环境
  未来可能被拦；UA/origin 已可配。真实账户登录走真实浏览器栈（无头 new headless
  与有头同指纹，§4.3）。
- **guest 权限边界**：news/relevant、screener、tax_lot 等对 guest 受限——已全部
  在真实账户回归（非实现缺口）；写路径（tax_lot/update、drawing 写、saveScanQuery、
  客服写、demo_account）按纪律不进真实账户自动化。
- **observeOrders status 归一**以 bundle 官方映射为准；wire 原值在 `rawStatus`，
  新状态归 `NONE` 不丢事件。
- **`pnpm ci` 陷阱**：pnpm v12 里裸 `pnpm ci` 是 install 别名（假绿）；验证一律
  `pnpm run ci`。
- **TDA 遗留**：login 响应仍带 `userDomain:"TDA"` 等字段（解析需宽松），但认证
  入口已完全是 Schwab OAuth 单通道。

## 11. 工程约定

- 提交：小而聚焦；文档与代码同 PR；`pnpm exec prettier --write` 后再提交
  （CI 第一关就是 prettier --check）。
- 门面契约单一事实源在 `src/client/wsJsonClient.ts` 接口；新增服务必须四面同步
  （接口/真实/mock/代理）+ index 导出 + 冒烟断言。
- 下单草稿 id 规则（CONFIRM/SUBMIT 同 id）**勿改**（§5.1）。
- 未录制确认的字段不猜测修改；错误帧自曝的枚举是权威来源，全量抄录进类型。
- 测试凭据与录制产物永不入库（`.gitignore`：`.env.*`、`scripts/artifacts/`、
  `scripts/puppeteer-data*/`；工具内建脱敏落盘）。
- 匿名登录页 DOM 可能漂移：auth 工具的选择器都有"找不到表单"降级路径；
  真实账户登录失败先 `--headed` 人工复核再改代码。
