// 黑盒探针：匿名连接 TOS WsJson 端点，发送协议握手，观察服务器响应。
// 不使用任何凭据。用法: node agent/tools/probe-ws.mjs [durationMs]
import WebSocket from "ws";

const URL_ = "wss://thinkorswim-services.schwab.com/Services/WsJson";
const durationMs = Number(process.argv[2] || 8000);

const ws = new WebSocket(URL_, {
  headers: {
    Pragma: "no-cache",
    Origin: "https://trade.thinkorswim.com",
    Upgrade: "websocket",
    "Cache-Control": "no-cache",
    Connection: "Upgrade",
    "Sec-WebSocket-Version": "13",
    "Sec-WebSocket-Extensions": "permessage-deflate; client_max_window_bits",
  },
  perMessageDeflate: true,
});

const t0 = Date.now();
const log = (...a) =>
  console.log(`+${((Date.now() - t0) / 1000).toFixed(2)}s`, ...a);

ws.on("open", () => {
  log("OPEN");
  const handshake = {
    ver: "27.*.*",
    fmt: "json-patches-structured",
    heartbeat: "2s",
  };
  ws.send(JSON.stringify(handshake));
  log("SENT handshake", JSON.stringify(handshake));
});
ws.on("message", (data) => {
  const s = data.toString();
  log("RECV", s.length > 2000 ? s.slice(0, 2000) + "…[truncated]" : s);
});
ws.on("close", (code, reason) => log("CLOSE", code, reason?.toString()));
ws.on("error", (e) => log("ERROR", e?.message || String(e)));

setTimeout(() => {
  log("done, closing");
  ws.close();
  process.exit(0);
}, durationMs);
