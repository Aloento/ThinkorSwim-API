// guestpass 登录工具 v4（2026-10-13 CDP 完整抓帧后重写）。
// 实测真实协议（guest）：
//  1. sws-gateway /api/v2/auth/login + /api/v2/auth/assert （账密，工具用 puppeteer 代填表单）
//  2. 302 → https://trade.thinkorswim.com/oauth?code=X
//  3. 前端 POST https://tosweb-sm.thinkorswim.com/api/v1/tsm/authorize
//       {authCode: X, clientId: "TOSGuestPassWeb"}
//     → 201 {authCode: Y, eat, newT, …}   ← Y 才是 wsjson 用的 authCode！
//  4. WS wss://papermoney-services.schwab.com/Services/WsJson（paper；真实=thinkorswim-services）
//     握手 {ver:"27.*.*",fmt:"json-patches-structured",heartbeat:"2s"}
//     → login/schwab {authCode: Y, clientId, redirectUri, tag:"TOSWeb"}
//     → snapshot {authenticationStatus:"OK", token, accessTokenInfo.refreshToken, …}
// 之后可用 token 走 login 复用会话。
// 用法: node scripts/auth-guest.mjs [user] [pass]
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

const USER = process.argv[2] || process.env.TOS_GUEST_USER;
const PASS = process.argv[3] || process.env.TOS_GUEST_PASS;
if (!USER || !PASS) {
  console.error(
    "usage: auth-guest.mjs <user> <pass> (or TOS_GUEST_USER/TOS_GUEST_PASS)",
  );
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

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--window-size=1100,800",
    ],
    userDataDir: join(here, "puppeteer-data"),
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1100, height: 800 });

    // 捕获 tsm/authorize 响应（里面有 wsjson 用的 authCode）
    let tsm = null;
    page.on("response", async (res) => {
      if (
        !tsm &&
        res.url().includes("/tsm/authorize") &&
        res.status() === 201
      ) {
        tsm = await res.json().catch(() => null);
        if (tsm)
          console.log(
            "tsm/authorize 201 captured: keys=%s",
            Object.keys(tsm).join(","),
          );
      }
    });

    await page.goto("https://trade.thinkorswim.com/guestpass", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await sleep(2500);

    for (let round = 0; round < 10 && !tsm; round++) {
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
      await sleep(2200);
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
      await sleep(2500);
    }
    if (!tsm)
      throw new Error("tsm/authorize 201 never observed (login failed?)");

    const clientId = tsm.clientId || "TOSGuestPassWeb";

    // v5：页面自己会用 tsm.authCode 完成 wsjson login/schwab（一次性 code 被页面消费），
    // 我们从 sessionStorage 收割页面拿到的 token；实测 token 与数据中心绑定，
    // PaperMoney 会话必须连 papermoney-services（连 thinkorswim-services 会报
    // "Invalid token (server session id)"）。
    let session = null;
    const deadline = Date.now() + 40000;
    while (!session && Date.now() < deadline) {
      for (const f of [...page.frames()]) {
        const st = await safe(() =>
          f.evaluate(() => ({
            token: sessionStorage.getItem("token"),
            tradingSystem: sessionStorage.getItem("tradingSystem"),
            isGP: sessionStorage.getItem("isGP"),
          })),
        );
        if (st?.token) {
          session = st;
          break;
        }
      }
      if (!session) await sleep(1000);
    }
    if (!session?.token)
      throw new Error(
        "page did not complete wsjson login (no sessionStorage.token)",
      );

    const tradingSystem = session.tradingSystem || "PaperMoney";
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

    // 实测确认：login 复用 token 无需 Cookie（v3 带全套 cookies 仍失败，
    // 失败根因是 DC 连错——paper token 必须连 papermoney-services）。
    // 新 WS 连接 + login（token 复用验证：token 应可跨连接使用）
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

    const artDir = join(here, "artifacts");
    mkdirSync(artDir, { recursive: true });
    // 证据落盘但不落敏感值：token/refreshToken 一律替换为长度占位
    const redacted = JSON.parse(JSON.stringify(body));
    for (const k of ["token", "refreshToken"]) {
      const v = redacted.body?.[k];
      if (typeof v === "string")
        redacted.body[k] = `<len ${v.length}>`;
    }
    if (typeof redacted.body?.accessTokenInfo?.refreshToken === "string")
      redacted.body.accessTokenInfo.refreshToken =
        `<len ${redacted.body.accessTokenInfo.refreshToken.length}>`;
    writeFileSync(
      join(artDir, "login-raw.json"),
      JSON.stringify(redacted, null, 2),
    );

    const b = body.body || {};
    if (b.authenticationStatus !== "OK") {
      throw new Error(
        `wsjson login rejected: ${b.message ?? body.header?.type}`,
      );
    }
    const accessToken = session.token;
    const refreshToken = undefined; // guest 会话无 refreshToken（真实账户另测）
    console.log(
      "wsjson login OK on %s (token reused across WS connections: YES)",
      wsUrl,
    );
    ws.close();

    // 写 .env.blackbox
    const envPath = join(here, ".env.blackbox");
    let content = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
    const setEnv = (text, key, val) => {
      const line = `${key}=${val}`;
      const re = new RegExp(`^${key}=.*$`, "m");
      if (re.test(text)) return text.replace(re, line);
      return text.trimEnd() + (text.trim() ? "\n" : "") + line + "\n";
    };
    content = setEnv(content, "TOS_GUEST_ACCESS_TOKEN", accessToken);
    if (refreshToken)
      content = setEnv(content, "TOS_GUEST_REFRESH_TOKEN", refreshToken);
    content = setEnv(content, "TOS_GUEST_WS_URL", wsUrl);
    content = setEnv(content, "TOS_GUEST_CLIENT_ID", clientId);
    content = setEnv(
      content,
      "TOS_GUEST_TRADING_SYSTEM",
      tradingSystem || "PaperMoney",
    );
    content = setEnv(
      content,
      "TOS_GUEST_TOKEN_SAVED_AT",
      new Date().toISOString(),
    );
    writeFileSync(envPath, content);
    console.log("saved to scripts/.env.blackbox");
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
