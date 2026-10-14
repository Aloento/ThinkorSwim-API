// 一次性：用真实 refreshToken 探测 access_token/get 的合法 scope。
// 候选来自 bundle 的 EAT scope 枚举 jo：api/authentication/authz-api/
// analyticsapi/update（tsm getEAT 的 scope 同名枚举）。
// 失败（Unrecognized scope）不消耗 RT；成功即轮换——立即回写 env。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, ".env.blackbox") });
const { RealWsJsonClient } = await import("../../dist/index.js");

const client = new RealWsJsonClient({ wsUrl: process.env.TOS_REAL_WS_URL });
await client.authenticateWithAccessToken({
  accessToken: process.env.TOS_REAL_ACCESS_TOKEN,
});

const candidates = [
  "api",
  "authentication",
  "authz-api",
  "analyticsapi",
  "update",
  "TOSWEB",
  "trading",
];
for (const scope of candidates) {
  try {
    const r = await client.getAccessToken({
      refreshToken: process.env.TOS_REAL_REFRESH_TOKEN,
      scope,
      clientId: "TOSWeb",
    });
    const b = r.body;
    console.log(`scope="${scope}" → SUCCESS keys=${Object.keys(b).join(",")}`);
    if (b.accessToken && b.refreshToken) {
      const envPath = join(here, ".env.blackbox");
      let content = readFileSync(envPath, "utf-8");
      const setEnv = (text, key, val) => {
        const line = `${key}=${val}`;
        const re = new RegExp(`^${key}=.*$`, "m");
        if (re.test(text)) return text.replace(re, line);
        return text.trimEnd() + (text.trim() ? "\n" : "") + line + "\n";
      };
      content = setEnv(content, "TOS_REAL_ACCESS_TOKEN", b.accessToken);
      content = setEnv(content, "TOS_REAL_REFRESH_TOKEN", b.refreshToken);
      content = setEnv(
        content,
        "TOS_REAL_TOKEN_SAVED_AT",
        new Date().toISOString(),
      );
      writeFileSync(envPath, content);
      console.log(`env rotated. accessExpiresIn=${b.accessExpiresIn}`);
    }
    break;
  } catch (e) {
    console.log(`scope="${scope}" → ${String(e?.message).slice(0, 120)}`);
  }
}
client.disconnect();
process.exit(0);
