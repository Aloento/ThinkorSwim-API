// 浏览器流量观察器：guest 登录后旁听真实前端如何调用 login/schwab。
// 用法: node agent/tools/watch-flow.mjs <user> <pass>
// 输出：agent/artifacts/watch-<ts>.log（含 WS 帧与 oauth 相关 HTTP）
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

const here = dirname(fileURLToPath(import.meta.url));
puppeteer.use(StealthPlugin());

const [USER, PASS] = process.argv.slice(2);
if (!USER || !PASS) {
  console.error("usage: watch-flow.mjs <user> <pass>");
  process.exit(2);
}
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const artDir = join(here, "..", "artifacts");
mkdirSync(artDir, { recursive: true });
const logPath = join(artDir, `watch-${ts}.log`);
const lines = [];
const t0 = Date.now();
const log = (...a) => {
  const line = `+${((Date.now() - t0) / 1000).toFixed(2)}s ${a.join(" ")}`;
  lines.push(line);
  console.log(line);
};
const flush = () => writeFileSync(logPath, lines.join("\n"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function dumpInputs(page, tag) {
  for (const frame of page.frames()) {
    const inputs = await frame
      .$$eval("input, button", (els) =>
        els.map((e) => ({
          type: e.type,
          id: e.id,
          aria: e.getAttribute("aria-label"),
        })),
      )
      .catch(() => []);
    if (inputs.length) log(`[inputs:${tag}] ${frame.url()} ${JSON.stringify(inputs)}`);
  }
}

const browser = await puppeteer.launch({
  headless: false,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1200,800"],
  userDataDir: join(here, "..", "puppeteer-data"),
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 800 });

page.on("request", (req) => {
  const u = req.url();
  if (req.resourceType() === "websocket") {
    log("[ws-connect]", u.split("?")[0]);
  }
  if (/oauth|auth|token|login|session/i.test(u) && !/\.(js|css|png|svg|woff)/.test(u)) {
    log("[http]", req.method(), u.length > 220 ? u.slice(0, 220) + "…" : u);
    const pd = req.postData();
    if (pd) log("[http-body]", pd.slice(0, 500));
  }
});
page.on("response", async (res) => {
  const u = res.url();
  if (/authapi|oauth.*token|gateway.*login/i.test(u) && res.status() < 400) {
    try {
      const t = await res.text();
      const red = t
        .replace(/("(?:access_token|refresh_token|token)"\s*:\s*")[^"]+/gi, "$1***")
        .slice(0, 600);
      log("[http-resp]", res.status(), u.split("?")[0], red);
    } catch {}
  }
});

log("goto /guestpass");
await page.goto("https://trade.thinkorswim.com/guestpass", {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await sleep(2000);
await dumpInputs(page, "initial");

// 简单表单填充（结构与 auth-guest 相同）
for (let round = 0; round < 6; round++) {
  const frames = page.frames();
  let done = false;
  for (const f of frames) {
    const uIn =
      (await f.$("#loginIdInput").catch(() => null)) ||
      (await f.$("input[type=text]:not([type=hidden])").catch(() => null));
    if (uIn) {
      await uIn.click();
      await uIn.type(USER, { delay: 80 });
      const btn = await f.$("#continueBtn").catch(() => null);
      if (btn) await btn.click();
      log(`[fill ${round}] user in ${f.url()}`);
      done = true;
      break;
    }
  }
  await sleep(2500);
  if (!done) {
    for (const f of frames) {
      const pw = await f.$("input[type=password]").catch(() => null);
      if (pw) {
        await pw.click();
        await pw.type(PASS, { delay: 80 });
        const btn =
          (await f.$("#continueBtn").catch(() => null)) ||
          (await f.$("button[type=submit]").catch(() => null));
        if (btn) await btn.click();
        log(`[fill ${round}] pass in ${f.url()}`);
        break;
      }
    }
  }
  await dumpInputs(page, `round${round}`);
  if (page.url().includes("/main") || page.url().includes("/trade")) break;
  await sleep(2500);
}

// 登录后驻留 45s 观察 wsjson 流量（页面自身会建 WS）
for (let i = 0; i < 45 && !page.url().includes("/main"); i++) await sleep(1000);
log("url now:", page.url());

// 旁听 WS 帧：通过 CDP
const cdp = await page.createCDPSession();
await cdp.send("Network.enable");
cdp.on("Network.webSocketFrameReceived", (e) => {
  const p = e.response?.payloadData || "";
  if (p && p.length > 30) log("[ws<-]", p.slice(0, 350));
});
cdp.on("Network.webSocketFrameSent", (e) => {
  const p = e.response?.payloadData || "";
  if (p && p.length > 20) log("[ws->]", p.slice(0, 350));
});

log("listening for ws frames 45s…");
await sleep(45000);
flush();
log("saved:", logPath);
await browser.close();
process.exit(0);
