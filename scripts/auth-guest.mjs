// guestpass 登录工具：puppeteer 代填表单，收割页面 sessionStorage.token，验证 token 可跨 WS 连接复用。
// 链路：sws-gateway login/assert → 302 /oauth?code=X → 前端 POST /api/v1/tsm/authorize
//   {authCode:X, clientId:"TOSGuestPassWeb"} → 201 返回的 authCode Y 才是 wsjson 用的 code。
// token 与数据中心绑定：PaperMoney 会话必须连 papermoney-services，
// 连 thinkorswim-services 报 "Invalid token (server session id)"。
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

    // 截 tsm/authorize 201：响应里的 authCode 才是 wsjson 用的 code
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

    // 页面自己消费一次性 authCode 并完成 wsjson login/schwab，
    // 所以这里从 sessionStorage 收割页面已拿到的 token，而不是自己发 authCode。
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

    // login 用 token 复用，无需 Cookie；token 可跨 WS 连接使用
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
    // 落盘脱敏：token/refreshToken 换成长度占位，工作区不留敏感明文
    const redacted = JSON.parse(JSON.stringify(body));
    for (const k of ["token", "refreshToken"]) {
      const v = redacted.body?.[k];
      if (typeof v === "string") redacted.body[k] = `<len ${v.length}>`;
    }
    if (typeof redacted.body?.accessTokenInfo?.refreshToken === "string")
      redacted.body.accessTokenInfo.refreshToken = `<len ${redacted.body.accessTokenInfo.refreshToken.length}>`;
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
    const refreshToken = undefined; // guest 会话不下发 refreshToken
    console.log(
      "wsjson login OK on %s (token reused across WS connections: YES)",
      wsUrl,
    );
    ws.close();

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
