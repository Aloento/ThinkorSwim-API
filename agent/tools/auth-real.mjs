// 真实账户登录工具 v2（默认无头：F2A 渠道自动选择——优先"Send a mobile
// notification"手机上点批准，页面自己轮询；无该渠道退回"Text Message"，
// 验证码在终端回传；自动勾选"信任设备"以签发 refreshToken）。
// 协议同 auth-guest.mjs（agent/02 §认证链路）：
//   1. https://trade.thinkorswim.com/ 账密登录（sws-gateway），随后 F2A
//   2. 前端 tsm/authorize → wsjson login/schwab
//   3. 收割 sessionStorage.token + login/schwab 响应里的 accessTokenInfo
//      （真实账户应含 refreshToken——Authenticator 端到端回归的关键证据）
// 用法: node agent/tools/auth-real.mjs [--headed]
//   默认无头（Chrome new headless，实测与有头指纹逐信号一致，stealth 抹平
//   webdriver/UA 后即与历史成功登录同指纹，不做手写覆盖）；--headed 回退有头
//   人工模式（v1 行为：弹窗后全人工完成 F2A）。
// 凭证: .env.blackbox 的 TOS_REAL_USER / TOS_REAL_PASS
// F2A: 无头模式自动选渠道；mobile 渠道等你手机上批准、SMS 渠道在终端输码，
//      共最多 5 分钟。
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import WebSocket from "ws";
import dotenv from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, ".env.blackbox") });

const HEADLESS = !process.argv.includes("--headed");
// 指纹策略（exp-fp.mjs 矩阵实测结论）：Chrome 155 的 new headless 与有头
// 指纹逐信号一致，唯二差异 navigator.webdriver=true 与 UA 里的
// "HeadlessChrome" token 都由 stealth 的默认 evasion 消除；其余（platform/
// UA-CH brands+highEntropy/plugins/WebGL/chrome 对象）无头有头本就相同。
// 因此用**默认 stealth**（与历史成功的有头登录同指纹），不做任何手写
// UA/UA-CH/时区覆盖——那些反而制造内部不一致（手写值与真实 Chrome 的
// platformVersion/brand 版本对不上，正是风控抓的点）。
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
let rl = null; // readline（终端回传短信码用，延迟创建；finally 统一关）

async function main() {
  const browser = await puppeteer.launch({
    // true = Chrome new headless（109+，与有头同一渲染栈；exp-fp.mjs 实测
    // Chrome 155 无头/有头指纹逐信号一致，stealth 抹平 webdriver/UA 后即与
    // 历史成功登录同指纹）；--headed 回退 v1 人工模式
    headless: HEADLESS,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--window-size=1280,900",
    ],
    userDataDir: join(here, "..", "puppeteer-data-real"),
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

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
        const t = ev.response?.payloadData;
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

    // 账密自动代填（guest 同款循环）。F2A 处理分两种模式：
    //  --headed：v1 行为，弹窗后全人工（sawF2A 只提示不动手）。
    //  无头（默认）：自动点选渠道（优先移动推送，退回短信+终端回传码），
    //               自动勾"信任设备"（refreshToken 的前提）。
    let sawF2A = false;
    let f2aMode = null; // 'mobile' | 'sms' | 'headed'
    const askTerminal = async (q) => {
      if (!rl)
        rl = createInterface({ input: process.stdin, output: process.stdout });
      return (await rl.question(q)).trim();
    };

    // 在 F2A 帧上点一个文本匹配的可见元素（radio/label/button 通用）
    const clickText = async (regex) => {
      for (const f of [...page.frames()]) {
        const clicked = await safe(() =>
          f.evaluate((src) => {
            const re = new RegExp(src, "i");
            const els = [
              ...document.querySelectorAll(
                "input[type=radio],label,button,[role=radio],[role=button],[role=checkbox],li,div",
              ),
            ];
            for (const el of els) {
              const t = (
                el.innerText ||
                el.textContent ||
                el.value ||
                ""
              ).trim();
              if (!t || t.length > 80 || !re.test(t)) continue;
              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;
              // radio 本体可能被隐藏，点其 label；反之点本体
              const target =
                el.tagName === "INPUT" ? el : (el.querySelector("input") ?? el);
              target.click();
              return t.slice(0, 60);
            }
            return null;
          }, regex.source),
        );
        if (clicked) {
          console.log(`[auth-real] clicked: "${clicked}"`);
          return true;
        }
      }
      return false;
    };

    // 找当前可见的验证码输入框并填入
    const fillCode = async (code) => {
      for (const f of [...page.frames()]) {
        const ok = await safe(async () => {
          const inp =
            (await f.$('input[inputmode="numeric"]')) ||
            (await f.$('input[name*="code" i]')) ||
            (await f.$('input[id*="code" i]')) ||
            (await f.$("input[type=text]:not([type=hidden])"));
          if (!inp) return false;
          await inp.click();
          await inp.type(code, { delay: 60 });
          const btn =
            (await f.$("#continueBtn")) ||
            (await f.$("button[type=submit]")) ||
            (
              await f.evaluateHandle(() =>
                [...document.querySelectorAll("button")]
                  .filter(
                    (b) =>
                      /continue|submit|verify/i.test(b.innerText) &&
                      b.getBoundingClientRect().width > 0,
                  )
                  .pop(),
              )
            ).asElement();
          if (btn && "click" in btn) await btn.click();
          return true;
        });
        if (ok) return true;
      }
      return false;
    };

    const handleF2A = async () => {
      // 信任设备勾选（文本附近找 checkbox，或自绘的 role=checkbox/switch）
      const trustChecked = await clickText(
        /trust (this )?(device|browser|computer)|remember (this )?device/i,
      );
      console.log(
        `[auth-real] trust-device checkbox: ${trustChecked ? "checked" : "not found (可能默认信任)"}`,
      );
      // 渠道优先级 1：移动推送——点击后页面挂轮询，等手机批准即可
      if (
        await clickText(
          /send a mobile notification|mobile (app )?(notification|push)|push (notification|to)/i,
        )
      ) {
        f2aMode = "mobile";
        const cont = await clickText(/^continue$|^send|^next$/);
        console.log(
          `[auth-real] 渠道=移动推送${cont ? "（已点继续）" : ""}——请在手机上批准（最长 5 分钟）`,
        );
        return;
      }
      // 渠道优先级 2：短信——终端回传验证码
      if (await clickText(/text message|send a text|sms/i)) {
        f2aMode = "sms";
        await clickText(/^continue$|^send|^next$/);
        await sleep(2000);
        // 多号码页：出现号码列表（形如 (•••) •••-1234）时选第一个
        await clickText(/\(\S{3}\)\s*\S{3}-\d{4}/);
        console.log("[auth-real] 渠道=短信——验证码将发到你手机");
        for (let attempt = 0; attempt < 3; attempt++) {
          const code = await askTerminal(
            `[auth-real] 输入短信验证码（第 ${attempt + 1}/3 次）: `,
          );
          if (!/^\d{4,8}$/.test(code)) {
            console.log("[auth-real] 验证码格式不对，重来");
            continue;
          }
          if (!(await fillCode(code))) {
            console.log("[auth-real] 没找到验证码输入框，等 3 秒重试");
            await sleep(3000);
            continue;
          }
          console.log("[auth-real] 验证码已提交，等待跳转…");
          return;
        }
        throw new Error("短信验证码 3 次均失败");
      }
      console.log(
        "[auth-real] 未识别 F2A 渠道按钮——若为 --headed 请人工；无头模式打印页面文本供校准",
      );
      const dump =
        (await safe(() =>
          page.evaluate(() => document.body?.innerText ?? ""),
        )) ?? "";
      console.log(
        "[auth-real] page text:",
        dump.slice(0, 600).replace(/\s+/g, " "),
      );
    };

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
          console.log("\n[auth-real] *** F2A 页面出现（总等待上限 5 分钟）***");
          console.log(
            "[auth-real] 页面提示（前 300 字）:",
            bodyText.slice(0, 300).replace(/\s+/g, " "),
          );
          if (HEADLESS) {
            await sleep(1500); // 等渠道列表渲染完
            await handleF2A();
          } else {
            f2aMode = "headed";
            console.log(
              "[auth-real] --headed 模式：请在弹出的浏览器窗口完成验证",
            );
          }
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
          const hint =
            f2aMode === "mobile"
              ? "（等待手机批准推送）"
              : f2aMode === "sms"
                ? "（短信码已提交，等待跳转）"
                : f2aMode === "headed"
                  ? "（等待人工完成验证）"
                  : "";
          console.log(
            "[auth-real] waiting for page session…",
            hint,
            "url=",
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
    rl?.close();
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
