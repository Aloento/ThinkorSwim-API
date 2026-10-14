// 挖 bundle 里 access_token/get 调用点与 scope 枚举
import { readFileSync } from "node:fs";
const s = readFileSync("agent/artifacts/frontend-index.js", "utf8");
for (const pat of ["ACCESS_TOKEN_GET", "access_token/get", "scope:"]) {
  let i = -1;
  let n = 0;
  while ((i = s.indexOf(pat, i + 1)) !== -1 && n < 6) {
    console.log(`\n=== ${pat} @${i} ===`);
    console.log(s.slice(Math.max(0, i - 380), i + 300).replace(/\s+/g, " "));
    n++;
  }
}
