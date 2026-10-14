// 挖 access_token/get 调用点与 scope 字面量
import { readFileSync } from "node:fs";
const s = readFileSync("agent/artifacts/frontend-index.js", "utf8");
let i = s.indexOf("EXCHANGE_RT_FOR_EAT,id");
while (i !== -1) {
  console.log("@" + i);
  console.log(s.slice(Math.max(0, i - 450), i + 320).replace(/\s+/g, " "));
  console.log("---");
  i = s.indexOf("EXCHANGE_RT_FOR_EAT,id", i + 1);
}
const seen = new Set();
for (const m of s.matchAll(/scope\s*[:=]\s*"([A-Z_]{2,20})"/g)) seen.add(m[1]);
for (const m of s.matchAll(/scope=([A-Z_]{2,20})/g)) seen.add(m[1]);
console.log("scope literals:", [...seen].join(", "));
// EAT scope 枚举定义候选（GetEat 用的枚举）
const j = s.indexOf("(e.TRADING=");
if (j > 0) console.log(s.slice(j - 200, j + 400).replace(/\s+/g, " "));
