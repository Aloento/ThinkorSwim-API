// 挖 EAT scope 枚举（jo/CLICKSTREAM 系）与 access_token/get 发送点
import { readFileSync } from "node:fs";
const s = readFileSync("agent/artifacts/frontend-index.js", "utf8");
// 1. EAT scope 枚举定义（形如 e.CLICKSTREAM="...",e.XXX="..."）
for (const pat of ["CLICKSTREAM=", "TRADING=", "e.GENERAL"]) {
  let i = -1,
    n = 0;
  while ((i = s.indexOf(pat, i + 1)) !== -1 && n < 3) {
    console.log(`=== ${pat} @${i}`);
    console.log(s.slice(Math.max(0, i - 260), i + 320).replace(/\s+/g, " "));
    console.log("---");
    n++;
  }
}
// 2. access_token/get 发送点（排除服务枚举区 47k-48k）
let i = -1,
  n = 0;
while ((i = s.indexOf("EXCHANGE_RT_FOR_EAT", i + 1)) !== -1 && n < 8) {
  if (i > 47000 && i < 48000) continue;
  console.log(`=== send @${i}`);
  console.log(s.slice(Math.max(0, i - 420), i + 360).replace(/\s+/g, " "));
  console.log("---");
  n++;
}
// 3. 服务枚举完整 scope 候选
const seen = new Set();
for (const m of s.matchAll(/="GENERAL"|"GENERAL"=/g)) seen.add(m.index);
console.log("GENERAL occurrences:", [...seen].join(","));
