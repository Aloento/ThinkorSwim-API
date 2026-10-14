# agent/ · 工作档案索引

对 `tos-wsjson-client`（thinkorswim 私有 WebSocket API 客户端，上游
`huskly/tos-wsjson-client` v0.12.0，停更于 2025-12-20）的重构前调研与计划。
**全部中文。**

## 文档

| 文件                                                 | 内容                                                                                                                                          | 何时读                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| [00-基线验证记录.md](00-基线验证记录.md)             | 安装/构建/测试/lint 基线全绿；**线上匿名探针实测**：端点存活、握手协议有效、服务器 build 已漂移到 `27.2640.4`                                 | 想了解"现在还能不能跑" |
| [01-代码结构分析.md](01-代码结构分析.md)             | 目录结构、核心运行时机制（状态机/消息回路/Observable 分发/两段式下单）、依赖与工程化盘点                                                      | 上手代码先读           |
| [02-协议与认证流程分析.md](02-协议与认证流程分析.md) | wsjson 线协议文档：信封格式、snapshot/patch 语义、两条认证链路、19 个服务矩阵、本地代理协议                                                   | 改协议相关代码必读     |
| [03-问题与风险清单.md](03-问题与风险清单.md)         | 编号化问题清单（R 认证 / P 协议 / T 交易 / A API / S 代理 / E 工程 / X 线上环境），含 **T1：placeOrder 的 promise 永不 resolve** 这类实锤 bug | 排期依据               |
| [04-黑盒测试方案.md](04-黑盒测试方案.md)             | L0~L5 分层测试、只读普查矩阵、认证生命周期用例（C1-C7）、模拟盘写用例（W1-W7）、安全闸门设计                                                  | 有测试账户后照此执行   |
| [05-重构计划.md](05-重构计划.md)                     | 阶段 0~5 渐进式重构路线图（止血→认证/重连→协议正确性→交易加固→类型打磨→发布与漂移监测）                                                       | 干活的总纲             |
| [06-黑盒实测发现.md](06-黑盒实测发现.md)             | **2026-10-13 实测证据**：guestpass 完整认证链、60+ 服务五轮普查矩阵（枚举全抄自错误帧）、W 组写用例、guest 权限边界、已知缺陷                 | 写代码前查服务真实形状 |
| [07-集成设计.md](07-集成设计.md)                     | 门面方法契约（全部实测背书）、下单草稿 id 规则（CONFIRM/SUBMIT 必须同 id）、第四批 31 handler 接入命名约定                                    | 改门面必读             |
| [08-功能对账表.md](08-功能对账表.md)                 | **完成度终局盘点**：网页版全部功能面板 ↔ 77 服务 / 68 handler / 门面方法逐一映射，✅实测/🔧待真实账户/⚠️危险 分级 + 证据索引                  | 判断"还差什么"读这个   |

## 工具

- [tools/probe-ws.mjs](tools/probe-ws.mjs) — L0 匿名握手探针（无凭据，随时可跑）：
  `node agent/tools/probe-ws.mjs 10000`
- [tools/auth-guest.mjs](tools/auth-guest.mjs) — guestpass 登录（puppeteer 代填表单，收割 wsjson token 写入 `.env.blackbox`）：
  `node agent/tools/auth-guest.mjs <user> <pass>`
- [tools/probe-services.mjs](tools/probe-services.mjs) — L2 只读服务普查（30+ 服务矩阵，录制原始帧到 `artifacts/probe-*/`）：
  `node agent/tools/probe-services.mjs [service ...]`
- [tools/probe-write.mjs](tools/probe-write.mjs) — L3 写用例（**硬闸门：只连 papermoney**，$1 限价 1 股白名单标的）：
  `node agent/tools/probe-write.mjs W1|W2|W4|W5|W6|…`
- [tools/watch-flow2.mjs](tools/watch-flow2.mjs) — CDP 全帧观察器（导航前挂监听，可看前端真实 WS 往返）
- [tools/smoke-lib.mjs](tools/smoke-lib.mjs) — **端到端冒烟（编译库 API 对真实 paper 服务器）**：
  登录→accounts→statement→market_hours→quotes→watchlist create/add/remove/rearrange/get/delete 闭环。
  `node agent/tools/smoke-lib.mjs`（需先 build 且 `.env.blackbox` 有效）
- [tools/smoke-order.mjs](tools/smoke-order.mjs) — 库 API 下单冒烟（$1 限价 1 股 + 自动撤单，T1 修复真机验证）
- [tools/.env.blackbox.example](tools/.env.blackbox.example) — 黑盒凭据模板，复制为
  `.env.blackbox` 填写（已被 gitignore；录制产物目录 `agent/artifacts/` 同样不入库）

## 一页结论

1. **工程基线健康**：pnpm + Node 26 下 install/build/test/lint 全绿（`pnpm run ci` 四关；
   注意 pnpm v12 里裸 `pnpm ci` 是 install 别名的假绿）。
2. **guest 认证链已端到端打通**（2026-10-13）：sws-gateway → tsm/authorize →
   **papermoney-services**（token 与数据中心绑定，paper token 连真实 DC 必失败）；
   token 可跨 WS 连接复用，有效期 ~24h。
3. **只读与写操作全面实测**：60+ 服务五轮普查 + 下单/撤单/告警/自选列表写闭环；
   成分修改实名 `watchlist/add|remove|rearrange`（bundle 挖掘，早期"不存在"结论已推翻）。
4. **库实现覆盖**：`ApiService` 77 个服务名、50+ handler、四批门面接入；下单两步
   （CONFIRM/SUBMIT 同草稿 id）、真实线帧回放测试、连接生命周期（重连退避/心跳
   看门狗/订阅重放）全部落地并在真实服务器上冒烟通过。
5. **真实账户回归（第九轮 2026-10-14）**：真实账户 F2A 登录（auth-real v2 默认
   无头，自动选渠道：移动推送手机点批准/短信终端回传码）+ 32 项只读
   核对全绿（`smoke-real.mjs`），news_relevant/study_subscribe/scan_query/
   transactions_categories 等 guest 受限项全部在真实账户跑通；token 自动续期
   （Authenticator）端到端链式轮换验证通过（scope="api"）。
   refreshToken 仅在 F2A 勾选"信任设备"时签发。
6. 重构按 05 的六个阶段推进（阶段 0/1/2 完成）；实测细节以 06 为准，集成以 07 为准。
