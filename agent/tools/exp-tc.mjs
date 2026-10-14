// 一次性：transactions/categories 正确参数形状验证（bundle 证据 6 参数）
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, ".env.blackbox") });

const ws = new WebSocket(process.env.TOS_REAL_WS_URL, {
  headers: {
    Pragma: "no-cache",
    Origin: "https://trade.thinkorswim.com",
    "Cache-Control": "no-cache",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  },
});
ws.on("open", () =>
  ws.send(
    JSON.stringify({
      ver: "27.*.*",
      fmt: "json-patches-structured",
      heartbeat: "2s",
    }),
  ),
);
let stage = 0;
const nowSec = Math.floor(Date.now() / 1000);
ws.on("message", (d) => {
  const msg = JSON.parse(d.toString());
  if (msg.heartbeat) return;
  if (!stage && msg.session) {
    ws.send(
      JSON.stringify({
        payload: [
          {
            header: { service: "login", id: "login", ver: 0 },
            params: {
              token: process.env.TOS_REAL_ACCESS_TOKEN,
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
  if (stage === 0 && msg.payload?.[0]?.body?.authenticationStatus === "OK") {
    stage = 1;
    ws.send(
      JSON.stringify({
        payload: [
          {
            header: { service: "transactions/categories", id: "tc-1", ver: 0 },
            params: {
              startTime: nowSec - 90 * 24 * 3600,
              endTime: nowSec,
              account: process.env.TOS_REAL_ACCOUNT_CODE || "00000000SCHW",
              transactionCategories: [],
              cryptoTransactionTypes: [],
              cashFutureTransactionTypes: [],
            },
          },
        ],
      }),
    );
    return;
  }
  if (stage === 1 && msg.payload) {
    for (const e of msg.payload) {
      if (e.header?.id === "tc-1") {
        console.log(
          "tc-1 →",
          e.header.type,
          JSON.stringify(e.body)
            .slice(0, 400)
            .replace(/[A-Za-z0-9_.-]{40,}/g, "<R>"),
        );
        process.exit(0);
      }
    }
  }
});
setTimeout(() => {
  console.log("TIMEOUT");
  process.exit(1);
}, 20000);
