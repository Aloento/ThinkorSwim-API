// guestpass 登录工具：用账密在 https://trade.thinkorswim.com/guestpass 登录，
// 截获 OAuth authCode，再用 wsjson login/schwab 换取 token，写入 .env.blackbox。
// 用法: node agent/tools/auth-guest.mjs [username] [password]
// 未传参时读环境变量 TOS_GUEST_USER / TOS_GUEST_PASS。
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
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
const redact = (s) =>
  String(s ?? "")
    .replace(/(code=)[^&\s"]+/g, "$1***")
    .replace(/(token["=:]\s*)[^"\s,}]+/gi, "$1***");

async function dumpPage(page, tag) {
  for (const frame of page.frames()) {
    const inputs = await frame
      .$$eval("input, button", (els) =>
        els.map((e) => ({
          tag: e.tagName,
          type: e.type,
          id: e.id,
          name: e.name,
          placeholder: e.placeholder,
          aria: e.getAttribute("aria-label"),
        })),
      )
      .catch(() => []);
    console.log(
      `[dump:${tag}] frame=${frame.url()} inputs=${JSON.stringify(inputs)}`,
    );
  }
}

async function findLoginFrame(page) {
  // 优先匹配已知网关域；否则任意含密码框的 frame；再否则主 frame
  const frames = page.frames();
  for (const f of frames) {
    if (
      f.url().includes("sws-gateway") ||
      f.url().includes("auth") ||
      f.url().includes("login")
    ) {
      const has = await f.$("input").catch(() => null);
      if (has) return f;
    }
  }
  for (const f of frames) {
    const pw = await f.$("input[type=password]").catch(() => null);
    if (pw) return f;
  }
  return page.mainFrame();
}

async function typeInto(frame, selector, text) {
  const el = await frame.$(selector);
  if (!el) return false;
  await el.click();
  await el.type(text, { delay: 90 });
  return true;
}

async function clickText(frame, text) {
  const ok = await frame
    .evaluate((t) => {
      const els = [
        ...document.querySelectorAll(
          "button, [role=button], input[type=submit], a",
        ),
      ];
      const el = els.find((e) =>
        (e.textContent || e.value || "").trim().toLowerCase().includes(t),
      );
      if (el) {
        el.click();
        return true;
      }
      return false;
    }, text.toLowerCase())
    .catch(() => false);
  return ok;
}

async function main() {
  console.log("launching browser…");
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=900,700"],
    userDataDir: join(here, "..", "puppeteer-data"),
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 700 });

    let authCode = null;
    page.on("request", (request) => {
      const u = request.url();
      if (u.includes("oauth?code=") || /[?&]code=[^&]+/.test(u)) {
        try {
          const url = new URL(u);
          const code = url.searchParams.get("code");
          if (code && !authCode) {
            authCode = code;
            console.log("OAuth code captured (len=%d)", code.length);
          }
        } catch {}
      }
      if (/password|passwd/i.test(u) && request.method() === "POST") {
        console.log("[net] password POST to", redact(u.split("?")[0]));
      }
    });

    console.log("goto guestpass…");
    await page.goto("https://trade.thinkorswim.com/guestpass", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await sleep(2500);
    await dumpPage(page, "initial");

    // 如果 guestpass 直接重定向到了登录页，也照常处理
    for (let round = 0; round < 8 && !authCode; round++) {
      const frame = await findLoginFrame(page);
      console.log(`[round ${round}] using frame ${frame.url()}`);
      // 1) 用户名
      let typed =
        (await typeInto(frame, "#loginIdInput", USER)) ||
        (await typeInto(frame, "input[name=username]", USER)) ||
        (await typeInto(frame, "input[type=email]", USER)) ||
        (await typeInto(frame, "input[type=text]:not([type=hidden])", USER));
      if (typed) {
        const clicked =
          (await clickText(frame, "continue")) ||
          (await clickText(frame, "next")) ||
          (await clickText(frame, "log in")) ||
          (await clickText(frame, "sign in")) ||
          (await clickText(frame, "submit"));
        console.log(`[round ${round}] user typed=${typed} clicked=${clicked}`);
        await sleep(2500);
        // 2) 密码
        const f2 = await findLoginFrame(page);
        const typedPw = await typeInto(f2, "input[type=password]", PASS);
        if (typedPw) {
          const clicked2 =
            (await clickText(f2, "log in")) ||
            (await clickText(f2, "continue")) ||
            (await clickText(f2, "sign in")) ||
            (await clickText(f2, "submit"));
          console.log(
            `[round ${round}] password typed=${typedPw} clicked=${clicked2}`,
          );
        }
      } else {
        await dumpPage(page, `round${round}`);
      }
      await sleep(3000);
      if (authCode) break;
    }

    if (!authCode) {
      throw new Error("no oauth code captured; check dumps above");
    }
    console.log("authCode obtained");

    // 用 authCode 走 wsjson login/schwab 换 token（裸协议，dump 原始响应到 artifacts）
    const { default: WebSocket } = await import("ws");
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
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("login/schwab timeout (20s)")),
        20000,
      );
      let sent = false;
      ws.on("open", () => {
        ws.send(
          JSON.stringify({
            ver: "27.*.*",
            fmt: "json-patches-structured",
            heartbeat: "2s",
          }),
        );
      });
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.heartbeat) return;
        if (!sent && msg.session) {
          sent = true;
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
          return;
        }
        const item = msg.payload?.[0];
        if (!item) return;
        // 原始响应留档（供协议漂移分析）
        const artDir = join(here, "..", "artifacts");
        mkdirSync(artDir, { recursive: true });
        writeFileSync(
          join(artDir, "login-schwab-raw.json"),
          JSON.stringify(msg, null, 2),
        );
        clearTimeout(timer);
        resolve(item.body);
        ws.close();
      });
      ws.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });

    const body = result;
    console.log(
      "login/schwab body keys:",
      Object.keys(body).join(","),
      "authenticated=",
      body.authenticated,
      "status=",
      body.authenticationStatus,
    );
    let accessToken = body.token;
    let refreshToken =
      body.accessTokenInfo?.refreshToken ??
      body.refreshToken ??
      body.refresh_token ??
      undefined;
    if (!accessToken) {
      throw new Error(
        `token exchange failed: ${body.message ?? body.authenticationStatus ?? "no token in body"}`,
      );
    }
    if (!accessToken) {
      throw new Error("token exchange failed (no accessToken)");
    }

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
    content = setEnv(
      content,
      "TOS_GUEST_TOKEN_SAVED_AT",
      new Date().toISOString(),
    );
    mkdirSync(here, { recursive: true });
    writeFileSync(envPath, content);
    console.log(
      "token saved to agent/tools/.env.blackbox (access len=%d, refresh=%s)",
      accessToken.length,
      refreshToken ? "yes" : "no",
    );
    console.log("DONE");
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error("FAILED:", redact(e?.message || e));
  process.exit(1);
});
