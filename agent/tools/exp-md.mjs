// market_depth 单独探测：延长等待 + 打印所有相关帧
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
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
    stage = 1;
    return;
  }
  if (stage === 1 && msg.payload?.[0]?.body?.authenticationStatus === "OK") {
    stage = 2;
    ws.send(
      JSON.stringify({
        payload: [
          {
            header: { service: "market_depth", id: "md-1", ver: 0 },
            params: { symbol: "AAPL", refreshRate: 300 },
          },
        ],
      }),
    );
    return;
  }
  for (const e of msg.payload ?? []) {
    const s = e.header?.service ?? "";
    if (stage >= 2) {
      console.log(
        "any-frame:",
        e.header?.service,
        e.header?.id,
        e.header?.type,
        JSON.stringify(e.body ?? {}).slice(0, 120),
      );
    }
  }
});
setTimeout(() => {
  console.log("DONE 25s");
  process.exit(0);
}, 25000);
