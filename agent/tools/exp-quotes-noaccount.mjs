// 快速实验：quotes 省略 account 参数是否可用（P7 可配置化的前提）
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, ".env.blackbox") });

const ws = new WebSocket(
  process.env.TOS_GUEST_WS_URL ||
    "wss://papermoney-services.schwab.com/Services/WsJson",
  {
    headers: {
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
      Origin: "https://trade.thinkorswim.com",
    },
  },
);

ws.on("open", () => {
  ws.send(
    JSON.stringify({
      ver: "27.*.*",
      fmt: "json-patches-structured",
      heartbeat: "2s",
    }),
  );
});

let n = 0;
ws.on("message", (d) => {
  const msg = JSON.parse(d.toString());
  if (msg.heartbeat) return;
  if (!n && msg.session) {
    ws.send(
      JSON.stringify({
        payload: [
          {
            header: { service: "login", id: "login", ver: 0 },
            params: {
              token: process.env.TOS_GUEST_ACCESS_TOKEN,
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
  if (msg.payload) {
    for (const e of msg.payload) {
      const h = e.header ?? {};
      console.log("frame:", h.service, h.id, h.type, e.body?.message ?? "");
      if (h.service === "login" && n === 0) {
        n = 1;
        // 实验：无 account 参数的 quotes
        ws.send(
          JSON.stringify({
            payload: [
              {
                header: { service: "quotes", id: "no-account-test", ver: 0 },
                params: {
                  symbols: ["AAPL"],
                  refreshRate: 300,
                  fields: ["MARK"],
                },
              },
            ],
          }),
        );
        continue;
      }
      if (h.id === "no-account-test") {
        console.log(
          "no-account quotes →",
          h.type,
          e.body?.message ??
            `items=${e.body?.items?.length} first=${e.body?.items?.[0]?.values?.MARK}`,
        );
        ws.close();
        process.exit(0);
      }
    }
  }
});

setTimeout(() => {
  console.log("TIMEOUT — no response");
  process.exit(1);
}, 15000);
