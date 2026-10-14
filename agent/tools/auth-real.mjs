// 真实账户登录工具 v1（F2A 半人工：有头浏览器弹出，用户手动完成二次验证）。
// 协议同 auth-guest.mjs（agent/02 §认证链路）：
//   1. https://trade.thinkorswim.com/ 账密登录（sws-gateway），随后 F2A
//   2. 前端 tsm/authorize → wsjson login/schwab
//   3. 收割 sessionStorage.token + login/schwab 响应里的 accessTokenInfo
//      （真实账户应含 refreshToken——Authenticator 端到端回归的关键证据）
// 用法: node agent/tools/auth-real.mjs
// 凭证: .env.blackbox 的 TOS_REAL_USER / TOS_REAL_PASS
// F2A: 脚本检测到验证页后等你最多 5 分钟（窗口内操作），期间持续抓帧。
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import WebSocket from "ws";
import dotenv from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, ".env.blackbox") });
puppeteer.use(StealthPlugin());

const USER = process.env.TOS_REAL_USER;
const PASS = process.env.TOS_REAL_PASS;
if (!USER || !PASS) {
  console.error("missing TOS_REAL_USER / TOS_REAL_PASS in .env.blackbox");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const safe = async (fn) => {
  try {
    return await fn();
  } catch {
    return null;
  }
};

const artDir = join(here, "..", "artifacts");
mkdirSync(artDir, { recursive: true });
const captured = []; // 全部 login/authorize 相关响应（脱敏前原样存档）
let pageRefreshToken = null; // 页面 login/schwab 帧里的 accessTokenInfo.refreshToken

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--window-size=1100,860",
    ],
    userDataDir: join(here, "..", "puppeteer-data-real"),
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1100, height: 860 });

    let tsm = null;
    page.on("response", async (res) => {
      const u = res.url();
      try {
        if (/login|assert|authorize|auth|factor|f2a/i.test(u)) {
          const ct = res.headers()["content-type"] || "";
          if (ct.includes("json")) {
            const j = await res.json().catch(() => null);
            if (j) captured.push({ url: u, status: res.status(), body: j });
          }
        }
      } catch {
        /* 观测失败不影响主流程 */
      }
      if (!tsm && u.includes("/tsm/authorize") && res.status() === 201) {
        tsm = await res.json().catch(() => null);
        if (tsm)
          console.log("tsm/authorize 201: keys=%s", Object.keys(tsm).join(","));
      }
    });
    // 抓 wsjson WS 帧里的 login/schwab 响应（accessTokenInfo.refreshToken
    // 只在该帧里；token 方式的 login 响应没有——本轮实测证实）
    page.on("wsresponse", () => {});
    const cdp = await page.createCDPSession();
    await cdp.send("Network.enable").catch(() => {});
    cdp.on("Network.webSocketFrameReceived", (ev) => {
      try {
        const t = ev.response?.payload;
        if (!t || !t.includes("accessTokenInfo") || !t.includes("refreshToken"))
          return;
        const msg = JSON.parse(t);
        for (const e of msg.payload ?? []) {
          if (e?.body?.accessTokenInfo?.refreshToken && !pageRefreshToken) {
            pageRefreshToken = e.body.accessTokenInfo.refreshToken;
            console.log(
              "[auth-real] captured refreshToken from page login/schwab frame (len=%d)",
              pageRefreshToken.length,
            );
          }
        }
      } catch {
        /* 非 JSON 帧忽略 */
      }
    });

    console.log("[auth-real] goto https://trade.thinkorswim.com/ ...");
    await page.goto("https://trade.thinkorswim.com/", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await sleep(3000);

    // 自动代填账密（同 guest 循环），F2A 页出现后转人工
    let sawF2A = false;
    for (let round = 0; round < 14 && !tsm; round++) {
      const url = page.url();
      const bodyText =
        (await safe(() =>
          page.evaluate(() => document.body?.innerText ?? ""),
        )) ?? "";
      if (
        /verify|one[- ]?time|passcode|authentication code|two[- ]?factor|security code|sign in with a code/i.test(
          bodyText,
        )
      ) {
        if (!sawF2A) {
          sawF2A = true;
          console.log(
            "\n[auth-real] *** F2A 页面出现 —— 请在弹出的浏览器窗口完成验证（最多等 5 分钟）***",
          );
          console.log(
            "[auth-real] 页面提示（前 300 字）:",
            bodyText.slice(0, 300).replace(/\s+/g, " "),
          );
        }
      }
      if (!sawF2A) {
        let did = false;
        for (const f of [...page.frames()]) {
          const uIn =
            (await safe(() => f.$("#loginIdInput"))) ||
            (await safe(() => f.$("input[type=text]:not([type=hidden])")));
          if (uIn) {
            await safe(() => uIn.click());
            await safe(() => uIn.type(USER, { delay: 90 }));
            const btn = await safe(() => f.$("#continueBtn"));
            if (btn) await safe(() => btn.click());
            did = true;
            break;
          }
        }
        if (!did) {
          for (const f of [...page.frames()]) {
            const pw = await safe(() => f.$("input[type=password]"));
            if (pw) {
              await safe(() => pw.click());
              await safe(() => pw.type(PASS, { delay: 90 }));
              const btn =
                (await safe(() => f.$("#continueBtn"))) ||
                (await safe(() => f.$("button[type=submit]")));
              if (btn) await safe(() => btn.click());
              did = true;
              break;
            }
          }
        }
        if (!did)
          console.log(
            `[auth-real] round ${round}: no form found, url=${url.slice(0, 80)}`,
          );
      }
      await sleep(2500);
    }

    // 收割：sessionStorage.token（页面完成 wsjson login 后写入）
    let session = null;
    const deadline = Date.now() + 300000; // 给 F2A 人工步骤留 5 分钟
    let lastNote = 0;
    while (!session && Date.now() < deadline) {
      for (const f of [...page.frames()]) {
        const st = await safe(() =>
          f.evaluate(() => ({
            token: sessionStorage.getItem("token"),
            tradingSystem: sessionStorage.getItem("tradingSystem"),
          })),
        );
        if (st?.token) {
          session = st;
          break;
        }
      }
      if (!session) {
        if (Date.now() - lastNote > 20000) {
          lastNote = Date.now();
          console.log(
            "[auth-real] waiting for page session… url=",
            page.url().slice(0, 90),
          );
        }
        await sleep(1500);
      }
    }
    if (!session?.token)
      throw new Error("no sessionStorage.token within 5min (F2A 未完成或超时)");

    const tradingSystem = session.tradingSystem || "";
    const paper = tradingSystem === "PaperMoney";
    const wsUrl = paper
      ? "wss://papermoney-services.schwab.com/Services/WsJson"
      : "wss://thinkorswim-services.schwab.com/Services/WsJson";
    console.log(
      "tradingSystem=%s → %s (tokenLen=%d)",
      tradingSystem,
      wsUrl,
      session.token.length,
    );

    // token 复用验证：新开 WS login + 抓 refreshToken
    const ws = new WebSocket(wsUrl, {
      headers: {
        Pragma: "no-cache",
        Origin: "https://trade.thinkorswim.com",
        "Cache-Control": "no-cache",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
      },
    });
    const body = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("wsjson login timeout (25s)")),
        25000,
      );
      let sent = false;
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
        if (!sent && msg.session) {
          sent = true;
          ws.send(
            JSON.stringify({
              payload: [
                {
                  header: { service: "login", id: "login", ver: 0 },
                  params: {
                    token: session.token,
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
        const item = msg.payload?.[0];
        if (!item) return;
        clearTimeout(timer);
        resolve(item);
      });
      ws.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });

    writeFileSync(
      join(artDir, "login-real.json"),
      JSON.stringify(body, null, 2),
    );
    writeFileSync(
      join(artDir, "login-real-responses.json"),
      JSON.stringify(captured, null, 2),
    );

    const b = body.body || {};
    if (b.authenticationStatus !== "OK") {
      throw new Error(
        `wsjson login rejected: ${b.message ?? body.header?.type}`,
      );
    }
    console.log("wsjson login OK user=%s", b.userCode);
    // 页面 login/schwab 帧（CDP 抓包）优先；直连 login 帧若自带也接受
    const refreshToken =
      pageRefreshToken ?? b.accessTokenInfo?.refreshToken ?? undefined;
    console.log("refreshToken present:", refreshToken ? "YES" : "NO");
    ws.close();

    const envPath = join(here, ".env.blackbox");
    let content = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
    const setEnv = (text, key, val) => {
      const line = `${key}=${val}`;
      const re = new RegExp(`^${key}=.*$`, "m");
      if (re.test(text)) return text.replace(re, line);
      return text.trimEnd() + (text.trim() ? "\n" : "") + line + "\n";
    };
    content = setEnv(content, "TOS_REAL_ACCESS_TOKEN", session.token);
    if (refreshToken)
      content = setEnv(content, "TOS_REAL_REFRESH_TOKEN", refreshToken);
    content = setEnv(content, "TOS_REAL_WS_URL", wsUrl);
    content = setEnv(
      content,
      "TOS_REAL_TRADING_SYSTEM",
      tradingSystem || "unknown",
    );
    content = setEnv(
      content,
      "TOS_REAL_TOKEN_SAVED_AT",
      new Date().toISOString(),
    );
    writeFileSync(envPath, content);
    console.log("saved to agent/tools/.env.blackbox (TOS_REAL_*)");
    console.log("DONE");
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(
    "FAILED:",
    String(e?.message || e).replace(/(code|token)[=:]\S+/gi, "$1=***"),
  );
  process.exit(1);
});
