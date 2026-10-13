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

async function safeText(el, fn) {
  try {
    return await fn(el);
  } catch {
    return null; // detached frame
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

// 简单表单填充（结构与 auth-guest 相同，全部操作防 detached frame）
for (let round = 0; round < 6; round++) {
  try {
    let didSomething = false;
    for (const f of [...page.frames()]) {
      const uIn =
        (await safeText(f, (fr) => fr.$("#loginIdInput"))) ||
        (await safeText(f, (fr) => fr.$("input[type=text]:not([type=hidden])")));
      if (uIn) {
        await safeText(uIn, (el) => el.click());
        await safeText(uIn, (el) => el.type(USER, { delay: 80 }));
        const btn = await safeText(f, (fr) => fr.$("#continueBtn"));
        if (btn) await safeText(btn, (el) => el.click());
        log(`[fill ${round}] user in ${f.url()}`);
        didSomething = true;
        break;
      }
    }
    await sleep(2500);
    if (!didSomething) {
      for (const f of [...page.frames()]) {
        const pw = await safeText(f, (fr) => fr.$("input[type=password]"));
        if (pw) {
          await safeText(pw, (el) => el.click());
          await safeText(pw, (el) => el.type(PASS, { delay: 80 }));
          const btn =
            (await safeText(f, (fr) => fr.$("#continueBtn"))) ||
            (await safeText(f, (fr) => fr.$("button[type=submit]")));
          if (btn) await safeText(btn, (el) => el.click());
          log(`[fill ${round}] pass in ${f.url()}`);
          break;
        }
      }
    }
  } catch (e) {
    log(`[fill ${round}] error: ${e.message?.slice(0, 120)}`);
  }
  await dumpInputs(page, `round${round}`);
  if (new URL(page.url()).pathname.startsWith("/main")) break;
  await sleep(2500);
}

// 登录后驻留观察：抓 localStorage/sessionStorage 中的 token 线索
for (let i = 0; i < 45 && !new URL(page.url()).pathname.startsWith("/main"); i++)
  await sleep(1000);
log("url now:", page.url());

for (const f of [...page.frames()]) {
  const store = await safeText(f, async (fr) =>
    fr.evaluate(() =>
      Object.entries({
        ...Object.fromEntries(
          Object.keys(sessionStorage || {}).map((k) => [k, sessionStorage.getItem(k)]),
        ),
      }),
    ).catch(() => null),
  );
  if (store) {
    for (const [k, v] of Object.entries(store)) {
      const red = String(v)
        .replace(/([A-Za-z0-9_-]{24,})\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, (m) => m.slice(0, 20) + "…JWT")
        .slice(0, 240);
      log(`[sessionStorage:${f.url().slice(0, 60)}] ${k} = ${red}`);
    }
  }
}
for (const name of ["localStorage"]) {
  const dump = await page
    .evaluate((n) => {
      const out = {};
      for (let i = 0; i < window[n].length; i++) {
        const k = window[n].key(i);
        out[k] = String(window[n].getItem(k)).slice(0, 240);
      }
      return out;
    }, name)
    .catch(() => null);
  if (dump)
    for (const [k, v] of Object.entries(dump)) {
      const red = v
        .replace(/([A-Za-z0-9_-]{24,})\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, (m) => m.slice(0, 20) + "…JWT")
        .replace(/"(access_token|refresh_token|token|authorization)":"[^"]{20,}"/gi, '"$1":"<TOKEN>"');
      log(`[localStorage] ${k} = ${red.slice(0, 260)}`);
    }
}

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
