// 模拟盘写操作黑盒测试（W 组用例）。仅连 papermoney-services；拒绝连真实端点。
// 用法: node agent/tools/probe-write.mjs <W1|W2|W3|W4|W6|W7>
// 安全闸门：数量=1、限价=$1（远离市价，绝不成交）、标的白名单 AAPL、只连 paper。
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appendFileSync, mkdirSync } from "node:fs";
import WebSocket from "ws";
import dotenv from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, ".env.blackbox") });

const TOKEN = process.env.TOS_GUEST_ACCESS_TOKEN;
const WS_URL =
  process.env.TOS_GUEST_WS_URL || "wss://papermoney-services.schwab.com/Services/WsJson";
if (!TOKEN) {
  console.error("missing TOS_GUEST_ACCESS_TOKEN — run auth-guest.mjs first");
  process.exit(2);
}
// 安全闸门
if (!WS_URL.includes("papermoney")) {
  console.error("SAFETY: refusing to run write probes against a non-paper endpoint: " + WS_URL);
  process.exit(3);
}
const SYMBOL = "AAPL";
const LIMIT_PRICE = 1; // 远离市价的买单价，永不到来
const QTY = 1;
const ACCOUNT = "D-12345678"; // 实测 paper 账户（accounts 服务返回）

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const artDir = join(here, "..", "artifacts", "write-" + new Date().toISOString().slice(0, 10));
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
      ws.send(JSON.stringify({ ver: "27.*.*", fmt: "json-patches-structured", heartbeat: "2s" })),
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
                params: { token: TOKEN, domain: "TOS", platform: "PROD", tag: "TOSWeb" },
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

function record(msg) {
  appendFileSync(artFile, JSON.stringify({ t: Date.now(), msg }) + "\n");
  for (const item of msg.payload || []) {
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

async function main() {
  const ws = await connect();
  console.log(`[${caseName}] logged in (${WS_URL})`);
  ws.on("message", (d) => {
    const msg = JSON.parse(d.toString());
    if (!msg.heartbeat) record(msg);
  });
  await sleep(300);

  switch (caseName) {
    case "W1": // CONFIRM 草稿（不提交）
      send(ws, "place_order", `update-draft-order-${SYMBOL}`, {
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
      }, 1);
      await sleep(6000);
      break;

    case "W2": // 完整下单：CONFIRM→SUBMIT，观察 order_events
      send(ws, "place_order", `update-draft-order-${SYMBOL}`, {
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
      }, 1);
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

    default:
      console.error("unknown case; use W1|W2|W3|W4|W6|W6b|W7");
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
