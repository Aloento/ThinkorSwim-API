// 真实账户 Authenticator 端到端续期回归（一次性 refreshToken 轮换）。
//
// 关键口径（2026-10-14 真实账户实测，exp-token-scope.mjs / exp-auth-refresh.mjs）：
// - refreshToken 只在 F2A 时勾选"信任设备"才签发（用户确认）；随后
//   login/schwab 帧 accessTokenInfo.refreshToken 出现（CDP 抓到，len≈248~268）。
// - access_token/get（scope="api"）成功轮换：返回 {accessExpiresIn:86400,
//   accessToken, refreshToken}，accessToken 是 EAT（855 字符，"S0." 前缀），
//   **不是** wsjson login 帧用的 32 字符 session token（"x7gn…"）。EAT 供
//   EAT 鉴权的 REST/其他系统；拿它去 login 帧会报 NOT_AUTHORIZED: Invalid
//   token (server session id)。二者是不同 token，各司其职。
// - refreshToken 一次性：每次轮换旧的立即失效，必须持久化新值。
//
// 本脚本证明续期通道端到端可用：强制到期 → 缺省通道（getAccessToken，
// DEFAULT_REFRESH_SCOPE="api"）→ 断言轮换出新 EAT + 新 RT → 用新 RT 再续一次
// （链式，证明新 RT 已激活）→ 落盘 EAT(TOS_REAL_EAT_ACCESS_TOKEN) 与最新 RT；
// **不动** TOS_REAL_ACCESS_TOKEN（32 字符 session token），smoke-real 继续可用。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, ".env.blackbox") });

const { RealWsJsonClient, Authenticator } = await import("../../dist/index.js");

const wsUrl = process.env.TOS_REAL_WS_URL;
const accessToken = process.env.TOS_REAL_ACCESS_TOKEN;
const refreshToken = process.env.TOS_REAL_REFRESH_TOKEN;
if (!wsUrl || !accessToken || !refreshToken) {
  console.error("missing TOS_REAL_WS_URL/ACCESS_TOKEN/REFRESH_TOKEN");
  process.exit(2);
}

const client = new RealWsJsonClient({ wsUrl });
const login = await client.authenticateWithAccessToken({ accessToken });
console.log("[refresh] session-token login OK user=", login?.userCode);

let rotated = null;
const auth = new Authenticator({
  clientId: "TOSWeb",
  initial: { accessToken, refreshToken, obtainedAt: 0 }, // 0 = 立即视为过期
  channel: client, // 缺省通道 = getAccessToken（access_token/get 服务）
  onTokenRotated: (pair) => {
    rotated = pair;
  },
});

const fresh = await auth.getValidToken();
if (!fresh || typeof fresh !== "string") {
  console.error("[refresh] FAIL: getValidToken returned", typeof fresh);
  process.exit(1);
}
console.log(
  "[refresh] #1 getValidToken → EAT len=",
  fresh.length,
  "prefix=",
  fresh.slice(0, 3),
);
if (fresh === accessToken) {
  console.error("[refresh] FAIL: token unchanged — server did not rotate");
  process.exit(1);
}
if (fresh.length < 100) {
  console.error("[refresh] FAIL: refreshed token too short to be EAT");
  process.exit(1);
}
if (!rotated?.refreshToken || rotated.refreshToken === refreshToken) {
  console.error("[refresh] FAIL: refreshToken not rotated");
  process.exit(1);
}
console.log(
  "[refresh] #1 rotated: new EAT + new RT len=",
  rotated.refreshToken.length,
  "accessExpiresIn=",
  rotated.accessExpiresIn,
);
client.disconnect();

// 链式第二续期：证明 #1 的新 refreshToken 已激活（一次性轮换的验证核心）。
const client2 = new RealWsJsonClient({ wsUrl });
await client2.authenticateWithAccessToken({ accessToken });
const auth2 = new Authenticator({
  clientId: "TOSWeb",
  initial: { accessToken, refreshToken: rotated.refreshToken, obtainedAt: 0 },
  channel: client2,
});
const fresh2 = await auth2.getValidToken();
console.log("[refresh] #2 chained refresh → EAT len=", fresh2.length);
client2.disconnect();
if (fresh2 === fresh || fresh2.length < 100) {
  console.error("[refresh] FAIL: chained refresh did not produce new EAT");
  process.exit(1);
}

const envPath = join(here, ".env.blackbox");
let content = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
const setEnv = (text, key, val) => {
  const line = `${key}=${val}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) return text.replace(re, line);
  return text.trimEnd() + (text.trim() ? "\n" : "") + line + "\n";
};
content = setEnv(content, "TOS_REAL_EAT_ACCESS_TOKEN", fresh2);
content = setEnv(
  content,
  "TOS_REAL_REFRESH_TOKEN",
  auth2.currentRefreshToken ?? rotated.refreshToken,
);
writeFileSync(envPath, content);
console.log(
  "[refresh] env: TOS_REAL_EAT_ACCESS_TOKEN + latest RT updated " +
    "(session TOS_REAL_ACCESS_TOKEN untouched)",
);
console.log("DONE");
process.exit(0);
