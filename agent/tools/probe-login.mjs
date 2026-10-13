// 裸协议探针：用 authCode 走 login/schwab，dump 完整原始响应 JSON。
// 用法: node agent/tools/probe-login.mjs <authCode>
// authCode 是一次性的，须新鲜。
import WebSocket from "ws";

const authCode = process.argv[2];
if (!authCode) {
  console.error("usage: probe-login.mjs <authCode>");
  process.exit(2);
}

const ws = new WebSocket(
  "wss://thinkorswim-services.schwab.com/Services/WsJson",
  {
    headers: {
      Pragma: "no-cache",
      Origin: "https://trade.thinkorswim.com",
      "Cache-Control": "no-cache",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
    },
  },
);

const t0 = Date.now();
const log = (...a) =>
  console.log(`+${((Date.now() - t0) / 1000).toFixed(2)}s`, ...a);
let phase = "handshake";

ws.on("open", () => {
  ws.send(JSON.stringify({ ver: "27.*.*", fmt: "json-patches-structured", heartbeat: "2s" }));
});
ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.heartbeat) return;
  if (phase === "handshake" && msg.session) {
    phase = "login";
    ws.send(
      JSON.stringify({
        payload: [
          {
            header: { service: "login/schwab", id: "login/schwab", ver: 0 },
            params: {
              authCode,
              clientId: "TOSWeb",
              redirectUri: "https://trade.thinkorswim.com/oauth",
              tag: "TOSWeb",
            },
          },
        ],
      }),
    );
    log("SENT login/schwab");
    return;
  }
  // dump 完整原文（token 部分遮蔽中间段）
  const redacted = JSON.parse(JSON.stringify(msg));
  try {
    for (const item of redacted.payload || []) {
      const b = item.body || {};
      for (const k of ["token", "refreshToken"]) {
        if (typeof b[k] === "string") b[k] = b[k].slice(0, 12) + "…len" + b[k].length;
        if (b.accessTokenInfo && typeof b.accessTokenInfo.refreshToken === "string")
          b.accessTokenInfo.refreshToken =
            b.accessTokenInfo.refreshToken.slice(0, 12) + "…len" + b.accessTokenInfo.refreshToken.length;
      }
    }
  } catch {
    /* redact 失败不影响原样转发 */
  }
  log("RECV", JSON.stringify(redacted, null, 1));
  if (phase === "login") {
    phase = "done";
    setTimeout(() => {
      ws.close();
      process.exit(0);
    }, 500);
  }
});
ws.on("error", (e) => log("ERROR", e.message));
ws.on("close", (c) => log("CLOSE", c));
setTimeout(() => {
  log("timeout, phase=" + phase);
  process.exit(1);
}, 15000);
