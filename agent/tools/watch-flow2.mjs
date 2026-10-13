// v2 观察器：在页面导航前就启用 CDP Network，完整捕获 WsJson 的 WS 帧（含 login 消息原文）。
// 用法: node agent/tools/watch-flow2.mjs <user> <pass>
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

const here = dirname(fileURLToPath(import.meta.url));
puppeteer.use(StealthPlugin());
const [USER, PASS] = process.argv.slice(2);
if (!USER || !PASS) {
  console.error("usage: watch-flow2.mjs <user> <pass>");
  process.exit(2);
}
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const artDir = join(here, "..", "artifacts");
mkdirSync(artDir, { recursive: true });
const logPath = join(artDir, `watch2-${ts}.log`);
const lines = [];
const t0 = Date.now();
const log = (...a) => {
  const line = `+${((Date.now() - t0) / 1000).toFixed(2)}s ${a.join(" ")}`;
  lines.push(line);
  console.log(line);
};
const flush = () => writeFileSync(logPath, lines.join("\n"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const safe = async (fn) => {
  try {
    return await fn();
  } catch {
    return null;
  }
};

const browser = await puppeteer.launch({
  headless: false,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1200,800"],
  userDataDir: join(here, "..", "puppeteer-data"),
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 800 });

const cdp = await page.createCDPSession();
await cdp.send("Network.enable");
const wsUrls = new Map();
cdp.on("Network.webSocketCreated", (e) => {
  wsUrls.set(e.requestId, e.url);
  log("[ws-created]", e.url.split("?")[0]);
});
cdp.on("Network.webSocketFrameSent", (e) => {
  const p = e.response?.payloadData || "";
  if (!p || p.length < 8) return;
  const url = wsUrls.get(e.requestId) || "?";
  const red = p
    .replace(/("token"\s*:\s*")[^"]{8}[^"]*/g, "$1<REDACTED>")
    .replace(/("authCode"\s*:\s*")[^"]{8}[^"]*/g, "$1<REDACTED>");
  log("[ws->]", url.includes("WsJson") ? "WSJSON" : url.split("/")[2], red.slice(0, 500));
});
cdp.on("Network.webSocketFrameReceived", (e) => {
  const p = e.response?.payloadData || "";
  if (!p || p.length < 40) return;
  const url = wsUrls.get(e.requestId) || "?";
  const red = p
    .replace(/("token"\s*:\s*")[^"]{8}[^"]*/g, "$1<REDACTED>")
    .replace(/("refreshToken"\s*:\s*")[^"]{8}[^"]*/g, "$1<REDACTED>");
  log("[ws<-]", url.includes("WsJson") ? "WSJSON" : url.split("/")[2], red.slice(0, 700));
});

page.on("request", (req) => {
  const u = req.url();
  if (u.includes("tsm/authorize")) {
    log("[tsm-auth]", req.method(), (req.postData() || "").slice(0, 300));
  }
});
page.on("response", async (res) => {
  const u = res.url();
  if (u.includes("tsm/authorize")) {
    const t = await res.text().catch(() => "");
    log("[tsm-resp]", res.status(), t.replace(/([A-Za-z0-9_-]{20,})/g, (m) => m.slice(0, 10) + "…L" + m.length).slice(0, 600));
  }
});

log("goto /guestpass");
await page.goto("https://trade.thinkorswim.com/guestpass", { waitUntil: "domcontentloaded", timeout: 60000 });

for (let round = 0; round < 10; round++) {
  // 用户名
  let did = false;
  for (const f of [...page.frames()]) {
    const uIn = (await safe(() => f.$("#loginIdInput"))) || (await safe(() => f.$("input[type=text]:not([type=hidden])")));
    if (uIn) {
      await safe(() => uIn.click());
      await safe(() => uIn.type(USER, { delay: 80 }));
      const btn = await safe(() => f.$("#continueBtn"));
      if (btn) await safe(() => btn.click());
      log(`[fill${round}] user`);
      did = true;
      break;
    }
  }
  await sleep(2200);
  if (!did) {
    for (const f of [...page.frames()]) {
      const pw = await safe(() => f.$("input[type=password]"));
      if (pw) {
        await safe(() => pw.click());
        await safe(() => pw.type(PASS, { delay: 80 }));
        const btn = (await safe(() => f.$("#continueBtn"))) || (await safe(() => f.$("button[type=submit]")));
        if (btn) await safe(() => btn.click());
        log(`[fill${round}] pass`);
        break;
      }
    }
  }
  await sleep(4000);
  const onApp = page.url().startsWith("https://trade.thinkorswim.com/");
  if (onApp && round >= 4) break; // 给 wsjson 至少 ~20s 观察窗
}

log("staying 40s to capture wsjson traffic…");
await sleep(40000);
flush();
log("saved:", logPath);
await browser.close();
process.exit(0);
