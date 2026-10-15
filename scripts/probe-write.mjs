// 黑盒写操作用例（W 组），仅纸面账户。仅连 papermoney-services；拒绝连真实端点。
// 用法: node scripts/probe-write.mjs <W1|W2|W3|W4|W6|W7|W8|W9|W9b|W10|W11>
// 安全闸门：数量=1、限价=$1（远离市价，绝不成交）、标的白名单 AAPL、只连 paper。
// W8/W9/W10/W11：⚠️ 只发 CONFIRM(ver:1)，永不 SUBMIT——MARKET 单
// SUBMIT 会立即成交；期权腿用 option_chain/get 的真实合约 + $0.01 深虚值。
// 账户代码不硬编码：优先 TOS_PAPER_ACCOUNT，否则登录后从 accounts 现取 D- 开头项。
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appendFileSync, mkdirSync } from "node:fs";
import WebSocket from "ws";
import dotenv from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, ".env.blackbox") });

const TOKEN = process.env.TOS_GUEST_ACCESS_TOKEN;
const WS_URL =
  process.env.TOS_GUEST_WS_URL ||
  "wss://papermoney-services.schwab.com/Services/WsJson";
if (!TOKEN) {
  console.error("missing TOS_GUEST_ACCESS_TOKEN — run auth-guest.mjs first");
  process.exit(2);
}
// 安全闸门
if (!WS_URL.includes("papermoney")) {
  console.error(
    "SAFETY: refusing to run write probes against a non-paper endpoint: " +
      WS_URL,
  );
  process.exit(3);
}
const SYMBOL = "AAPL";
const LIMIT_PRICE = 1; // 远离市价的买单价，永不到来
const QTY = 1;
let ACCOUNT = process.env.TOS_PAPER_ACCOUNT || null; // 未设置则登录后从 accounts 现取

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const artDir = join(
  here,
  "artifacts",
  "write-" + new Date().toISOString().slice(0, 10),
);
mkdirSync(artDir, { recursive: true });
const caseName = process.argv[2] || "W1";
const artFile = join(artDir, `${caseName}.jsonl`);

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, {
      headers: {
        Pragma: "no-cache",
        Origin: "https://trade.thinkorswim.com",
        "Cache-Control": "no-cache",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
      },
    });
    const timer = setTimeout(() => reject(new Error("connect timeout")), 15000);
    let loggedIn = false;
    ws.on("open", () =>
      ws.send(
        JSON.stringify({
          ver: "27.*.*",
          fmt: "json-patches-structured",
          heartbeat: "2s",
        }),
      ),
    );
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.heartbeat) return;
      if (!loggedIn && msg.session) {
        loggedIn = true;
        ws.send(
          JSON.stringify({
            payload: [
              {
                header: { service: "login", id: "login", ver: 0 },
                params: {
                  token: TOKEN,
                  domain: "TOS",
                  platform: "PROD",
                  tag: "TOSWeb",
                },
              },
            ],
          }),
        );
        return;
      }
      const status = msg.payload?.[0]?.body?.authenticationStatus;
      if (status === "OK") {
        clearTimeout(timer);
        resolve(ws);
      } else if (status) {
        clearTimeout(timer);
        reject(new Error("login failed: " + status));
      }
    });
    ws.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

// 最近一次 send 之后收到的 payload 条目（W11 变体判定用；每次 send 前清空）
const seen = [];

function record(msg) {
  appendFileSync(artFile, JSON.stringify({ t: Date.now(), msg }) + "\n");
  for (const item of msg.payload || []) {
    seen.push(item);
    const body = JSON.stringify(item.body ?? {}).slice(0, 260);
    console.log(
      `  ← ${item.header?.service}/${item.header?.id} [${item.header?.type}] ${body}`,
    );
  }
}

const send = (ws, service, id, params, ver = 0) => {
  const m = { payload: [{ header: { service, id, ver }, params }] };
  console.log(`  → ${service}/${id} ${JSON.stringify(params).slice(0, 220)}`);
  ws.send(JSON.stringify(m));
};

// 等待指定 service+id 的响应帧（W8-W10 链式探测用）。
function waitResponse(ws, id, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for response to ${id}`)),
      timeoutMs,
    );
    const onMsg = (d) => {
      const msg = JSON.parse(d.toString());
      const item = msg.payload?.[0];
      if (item?.header?.id === id && item.header.type) {
        clearTimeout(timer);
        ws.off("message", onMsg);
        resolve(item);
      }
    };
    ws.on("message", onMsg);
  });
}

async function main() {
  const ws = await connect();
  console.log(`[${caseName}] logged in (${WS_URL})`);
  ws.on("message", (d) => {
    const msg = JSON.parse(d.toString());
    if (!msg.heartbeat) record(msg);
  });
  await sleep(300);

  // 账户代码解析：env 未提供时从 accounts 服务现取（paper 账户以 D- 开头）
  if (!ACCOUNT) {
    send(ws, "accounts", "fetch-account", {});
    const r = await waitResponse(ws, "fetch-account");
    ACCOUNT = (r.body?.items ?? [])
      .map((a) => a.code)
      .find((c) => c?.startsWith("D-"));
    if (!ACCOUNT) {
      console.error("no paper (D-) account in accounts response");
      ws.close();
      process.exit(2);
    }
    console.log(`[${caseName}] paper account from accounts: resolved ✓`);
  }

  switch (caseName) {
    case "W1": // CONFIRM 草稿（不提交）
      send(
        ws,
        "place_order",
        `update-draft-order-${SYMBOL}`,
        {
          accountCode: ACCOUNT,
          action: "CONFIRM",
          marker: "SINGLE",
          orders: [
            {
              requestType: "INIT_STOCK",
              orderType: "LIMIT",
              limitPrice: LIMIT_PRICE,
              legs: [{ symbol: SYMBOL, quantity: QTY }],
            },
          ],
        },
        1,
      );
      await sleep(6000);
      break;

    case "W2": // 完整下单：CONFIRM→SUBMIT，观察 order_events
      send(
        ws,
        "place_order",
        `update-draft-order-${SYMBOL}`,
        {
          accountCode: ACCOUNT,
          action: "CONFIRM",
          marker: "SINGLE",
          orders: [
            {
              requestType: "INIT_STOCK",
              orderType: "LIMIT",
              limitPrice: LIMIT_PRICE,
              legs: [{ symbol: SYMBOL, quantity: QTY }],
            },
          ],
        },
        1,
      );
      await sleep(3500);
      // SUBMIT 必须复用 CONFIRM 的草稿 id（服务端按 service+id 关联草稿态）
      send(ws, "place_order", `update-draft-order-${SYMBOL}`, {
        accountCode: ACCOUNT,
        action: "SUBMIT",
        marker: "SINGLE",
        orders: [
          {
            requestType: "INIT_STOCK",
            orderType: "LIMIT",
            tif: "DAY",
            limitPrice: LIMIT_PRICE,
            legs: [{ symbol: SYMBOL, quantity: QTY }],
            tag: "TOSWeb",
          },
        ],
      });
      await sleep(8000);
      break;

    case "W3": // 改价（需先 W2 有 working 单）：EDIT_ORDER + refOrderId
      {
        const ref = Number(process.argv[3]);
        if (!ref) {
          console.error("usage: probe-write.mjs W3 <refOrderId>");
          process.exit(2);
        }
        send(ws, "place_order", `edit-order-${SYMBOL}`, {
          accountCode: ACCOUNT,
          action: "SUBMIT",
          marker: "SINGLE",
          orders: [
            {
              requestType: "EDIT_ORDER",
              orderType: "LIMIT",
              tif: "DAY",
              refOrderId: ref,
              limitPrice: 2,
              legs: [{ symbol: SYMBOL, quantity: QTY }],
              tag: "TOSWeb",
            },
          ],
        });
        await sleep(8000);
      }
      break;

    case "W4": // 撤单
      {
        const orderId = Number(process.argv[3]);
        if (!orderId) {
          console.error("usage: probe-write.mjs W4 <orderId>");
          process.exit(2);
        }
        send(ws, "cancel_order", `cancel-${orderId}`, { orderId });
        await sleep(6000);
        // 再撤一次验证错误路径
        send(ws, "cancel_order", `cancel-${orderId}-again`, { orderId });
        await sleep(4000);
      }
      break;

    case "W6": // alert 生命周期
      send(ws, "alerts/create", "probe-alert-create", {
        alert: {
          market: {
            components: [{ symbol: SYMBOL, quantity: 1 }],
            exchange: "BEST",
            threshold: 99999,
            field: "MARK",
            operator: "GREATER_OR_EQUAL",
          },
        },
      });
      await sleep(4000);
      send(ws, "alerts/lookup", "ACTIVE_alerts_lookup", { status: "ACTIVE" });
      await sleep(4000);
      break;

    case "W6b": // 撤 alert
      {
        const alertId = Number(process.argv[3]);
        if (!alertId) {
          console.error("usage: probe-write.mjs W6b <alertId>");
          process.exit(2);
        }
        send(ws, "alerts/cancel", "cancel_alert", { alertId });
        await sleep(4000);
      }
      break;

    case "W7": // 订阅 alert 推送后创建触发型 alert（MARK 当前价上方 0.1%）
      send(ws, "alerts/subscribe", "alerts_subscribe", {
        alertTypes: ["CHANGED_ALERT", "TRIGGERED_ALERT", "EXPIRED_ALERT"],
      });
      await sleep(1500);
      send(ws, "alerts/create", "probe-alert-create-2", {
        alert: {
          market: {
            components: [{ symbol: SYMBOL, quantity: 1 }],
            exchange: "BEST",
            threshold: 99999,
            field: "MARK",
            operator: "GREATER_OR_EQUAL",
          },
        },
      });
      await sleep(8000);
      break;

    case "W5": // watchlist 写：create→rename→delete（错误帧会暴露参数名）
      send(ws, "watchlist/create", "probe-wl-create", {
        watchlistName: "ProbeWL",
        symbols: ["AAPL", "SPY"],
      });
      await sleep(4000);
      send(ws, "watchlist/categories", "probe-wl-cat", {
        categories: ["PERSONAL"],
      });
      await sleep(4000);
      break;

    case "W5b": // watchlist add_symbols / rename / delete（参数名由错误帧暴露）
      {
        const wlId = Number(process.argv[3]);
        if (!wlId) {
          console.error(
            "usage: probe-write.mjs W5b <watchlistId> [add|rename|delete]",
          );
          process.exit(2);
        }
        const op = process.argv[4] || "add";
        if (op === "add") {
          send(ws, "watchlist/add_symbols", "probe-wl-add", {
            watchlistId: wlId,
            symbols: ["TSLA"],
          });
        } else if (op === "rename") {
          send(ws, "watchlist/rename", "probe-wl-rename", {
            watchlistId: wlId,
            watchlistName: "ProbeWL2",
          });
        } else {
          send(ws, "watchlist/delete", "probe-wl-delete", {
            watchlistId: wlId,
          });
        }
        await sleep(4000);
      }
      break;

    case "W5c": // 变更 watchlist 成分：变体名探测（错误帧自曝正确名字）
      {
        const wlId = Number(process.argv[3] || "1222638069");
        const cases = [
          [
            "watchlist/update_symbols",
            { watchlistId: wlId, symbols: ["AAPL", "SPY", "TSLA"] },
          ],
          [
            "watchlist/save",
            {
              watchlist: {
                id: wlId,
                name: "ProbeWL2",
                symbols: ["AAPL", "SPY", "TSLA"],
              },
            },
          ],
          [
            "watchlist/update",
            { watchlistId: wlId, symbols: { add: ["TSLA"], delete: [] } },
          ],
        ];
        for (const [svc, params] of cases) {
          send(ws, svc, `probe-${svc.replace(/\W/g, "_")}`, params);
          await sleep(2500);
        }
      }
      break;

    case "W5d": // 假设：create 带 id 即覆盖保存（前端常这样实现 upsert）
      {
        const wlId = Number(process.argv[3]);
        if (!wlId) {
          console.error("usage: probe-write.mjs W5d <watchlistId>");
          process.exit(2);
        }
        send(ws, "watchlist/create", "probe-wl-upsert", {
          watchlistId: wlId,
          watchlistName: "ProbeWL2",
          symbols: ["AAPL", "SPY", "TSLA"],
        });
        await sleep(3000);
        send(ws, "watchlist/get", "probe-wl-verify", { watchlistId: wlId });
        await sleep(3000);
      }
      break;

    case "W5e": // 再试成分变更候选名，最后 delete 清理
      {
        const wlId = Number(process.argv[3]);
        if (!wlId) {
          console.error("usage: probe-write.mjs W5e <watchlistId> [--cleanup]");
          process.exit(2);
        }
        const cleanup = process.argv[4] === "--cleanup";
        if (!cleanup) {
          const cases = [
            [
              "watchlist/symbols",
              { watchlistId: wlId, symbols: ["AAPL", "SPY", "TSLA"] },
            ],
            [
              "watchlist/edit",
              { watchlistId: wlId, symbols: ["AAPL", "SPY", "TSLA"] },
            ],
            [
              "watchlist/modify",
              { watchlistId: wlId, symbols: ["AAPL", "SPY", "TSLA"] },
            ],
            [
              "watchlist/set_symbols",
              { watchlistId: wlId, symbols: ["AAPL", "SPY", "TSLA"] },
            ],
          ];
          for (const [svc, params] of cases) {
            send(ws, svc, `probe2-${svc.replace(/\W/g, "_")}`, params);
            await sleep(2500);
          }
        }
        send(ws, "watchlist/delete", "probe-wl-delete", { watchlistId: wlId });
        await sleep(3000);
        send(ws, "watchlist/categories", "probe-wl-cat-after", {
          categories: ["PERSONAL"],
        });
        await sleep(3000);
      }
      break;

    case "W5f": // bundle 挖掘：成分修改疑似 watchlist/add + watchlist/remove
      {
        const wlId = Number(process.argv[3]);
        if (!wlId) {
          console.error("usage: probe-write.mjs W5f <watchlistId>");
          process.exit(2);
        }
        const variants = [
          ["watchlist/add", { watchlistId: wlId, symbols: ["TSLA"] }],
          ["watchlist/add", { watchlistId: wlId, symbol: "TSLA" }],
          ["watchlist/remove", { watchlistId: wlId, symbols: ["TSLA"] }],
          [
            "watchlist/rearrange",
            { watchlistId: wlId, symbols: ["SPY", "AAPL"] },
          ],
        ];
        for (const [svc, params] of variants) {
          send(
            ws,
            svc,
            `probe3-${svc.replace(/\W/g, "_")}-${params.symbols ? "syms" : "sym"}`,
            params,
          );
          await sleep(2500);
        }
        send(ws, "watchlist/get", "probe-wl-verify2", { watchlistId: wlId });
        await sleep(3000);
      }
      break;

    case "W8": // CONFIRM MARKET（⚠️ 只 CONFIRM，绝不 SUBMIT——市价单会立即成交）
      send(
        ws,
        "place_order",
        `update-draft-order-${SYMBOL}`,
        {
          accountCode: ACCOUNT,
          action: "CONFIRM",
          marker: "SINGLE",
          orders: [
            {
              requestType: "INIT_STOCK",
              orderType: "MARKET",
              legs: [{ symbol: SYMBOL, quantity: QTY }],
            },
          ],
        },
        1,
      );
      await sleep(6000);
      break;

    case "W9": // CONFIRM STOP（stopPrice 远离市价；只 CONFIRM 绝不 SUBMIT）
      send(
        ws,
        "place_order",
        `update-draft-order-${SYMBOL}`,
        {
          accountCode: ACCOUNT,
          action: "CONFIRM",
          marker: "SINGLE",
          orders: [
            {
              requestType: "INIT_STOCK",
              orderType: "STOP",
              stopPrice: 1, // 远低于市价的买止损，即使误提交也极难触发
              legs: [{ symbol: SYMBOL, quantity: QTY }],
            },
          ],
        },
        1,
      );
      await sleep(6000);
      break;

    case "W10": {
      // CONFIRM 期权 leg：optionSeries→option_chain/get 拿真实合约代码，
      // 再 CONFIRM 一张远月深虚值 CALL @ $0.01（只 CONFIRM 绝不 SUBMIT）。
      send(ws, "optionSeries", "probe-optseries-w10", {
        underlying: SYMBOL,
      });
      const seriesItem = await waitResponse(ws, "probe-optseries-w10");
      const seriesName = seriesItem.body?.series?.[0]?.name;
      if (!seriesName) {
        console.error("W10: optionSeries returned no series");
        process.exit(1);
      }
      console.log(`  [W10] seriesName=${seriesName}`);
      send(ws, "option_chain/get", "probe-chain-w10", {
        underlyingSymbol: SYMBOL,
        filter: { strikeQuantity: 3, seriesNames: [seriesName] },
      });
      const chainItem = await waitResponse(ws, "probe-chain-w10");
      const pairs = chainItem.body?.optionSeries?.[0]?.optionPairs ?? [];
      const callSymbol = pairs[0]?.callSymbol;
      if (!callSymbol) {
        console.error("W10: option chain returned no optionPairs");
        process.exit(1);
      }
      console.log(`  [W10] callSymbol=${callSymbol}`);
      send(
        ws,
        "place_order",
        `update-draft-order-${callSymbol}`,
        {
          accountCode: ACCOUNT,
          action: "CONFIRM",
          marker: "SINGLE",
          orders: [
            {
              requestType: "INIT_STOCK",
              orderType: "LIMIT",
              limitPrice: 0.01, // 深虚值 @ 1 美分，即使误提交也几乎不可能成交
              legs: [{ symbol: callSymbol, quantity: 1 }],
            },
          ],
        },
        1,
      );
      await sleep(6000);
      break;
    }

    case "W9b": {
      // orderType 拼写探测：types.values 枚举是 STOPLIMIT（无下划线），
      // 验证 wire 上两种拼写哪种被接受（错误帧自曝）。
      for (const t of ["STOP_LIMIT", "STOPLIMIT"]) {
        send(
          ws,
          "place_order",
          `update-draft-order-${SYMBOL}-${t}`,
          {
            accountCode: ACCOUNT,
            action: "CONFIRM",
            marker: "SINGLE",
            orders: [
              {
                requestType: "INIT_STOCK",
                orderType: t,
                stopPrice: 1,
                limitPrice: 2,
                legs: [{ symbol: SYMBOL, quantity: QTY }],
              },
            ],
          },
          1,
        );
        await sleep(4000);
      }
      break;
    }

    case "W11": {
      // AMOUNT（名义额/碎股）线协议形状探测：⚠️ 只 CONFIRM，绝不 SUBMIT。
      // 目的 = 录到真实帧，确认碎股名义额单在 wire 上如何表达，以及服务端
      // 回读的 quantity 是否保持碎股（被对齐成整股 = LIMIT notional 陷阱）。
      // 名义额 $2：高于 TOS 碎股买单 $1.00 下限，且 CONFIRM 不会成交。
      // 变体逐个发（各自独立草稿 id），由响应/错误帧自曝正确写法。
      const NOTIONAL = Number(process.argv[3] || "2");
      const variants = [
        // v1：orderType=AMOUNT（types.values 枚举里有 AMOUNT），名义额放 legs.quantity
        {
          label: "AMOUNT-leg-quantity",
          order: {
            requestType: "INIT_STOCK",
            orderType: "AMOUNT",
            legs: [{ symbol: SYMBOL, quantity: NOTIONAL }],
          },
        },
        // v2：orderType=AMOUNT + 显式 amount 字段
        {
          label: "AMOUNT-amount-field",
          order: {
            requestType: "INIT_STOCK",
            orderType: "AMOUNT",
            amount: NOTIONAL,
            legs: [{ symbol: SYMBOL, quantity: NOTIONAL }],
          },
        },
        // v3：MARKET + legs 同时带 quantity 与 amount（部分前端用二者并存表达名义额）
        {
          label: "MARKET-leg-amount",
          order: {
            requestType: "INIT_STOCK",
            orderType: "MARKET",
            legs: [{ symbol: SYMBOL, quantity: NOTIONAL, amount: NOTIONAL }],
          },
        },
        // v4：orderType=AMOUNT，legs 不带 quantity（若必填会由错误帧自曝）
        {
          label: "AMOUNT-no-quantity",
          order: {
            requestType: "INIT_STOCK",
            orderType: "AMOUNT",
            amount: NOTIONAL,
            legs: [{ symbol: SYMBOL }],
          },
        },
      ];
      for (const v of variants) {
        const id = `update-draft-order-${SYMBOL}-w11-${v.label}`;
        seen.length = 0;
        send(
          ws,
          "place_order",
          id,
          {
            accountCode: ACCOUNT,
            action: "CONFIRM",
            marker: "SINGLE",
            orders: [v.order],
          },
          1,
        );
        await sleep(5000);
        const err = seen.find((i) => i.header?.type === "error");
        if (err) {
          console.log(
            `  [W11 ${v.label}] REJECTED: ${JSON.stringify(err.body ?? err.params ?? {}).slice(0, 300)}`,
          );
        } else {
          const leg = seen
            .map((i) => i.body?.orders?.[0]?.legs?.[0] ?? null)
            .find(Boolean);
          const conf = seen
            .map((i) => i.body?.orders?.[0]?.confirmation ?? null)
            .find(Boolean);
          console.log(
            `  [W11 ${v.label}] ACCEPTED leg=${JSON.stringify(leg ?? {})} conf=${JSON.stringify(conf ?? {})}`,
          );
          console.log(
            `  [W11 ${v.label}] 碎股判定: quantity=${leg?.quantity} (非整数量级 = 碎股保留)`,
          );
        }
      }
      break;
    }

    default:
      console.error(
        "unknown case; use W1|W2|W3|W4|W6|W6b|W7|W8|W9|W9b|W10|W11",
      );
      process.exit(2);
  }

  console.log("artifact:", artFile);
  ws.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e?.message || e);
  process.exit(1);
});
