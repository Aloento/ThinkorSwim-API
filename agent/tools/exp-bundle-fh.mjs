// 一次性：从 bundle 提取 FUNDAMENTALS_HISTORY 上下文与历史字段枚举
import { readFileSync } from "node:fs";
const s = readFileSync("agent/artifacts/frontend-index.js", "utf8");
for (const pat of [
  "FUNDAMENTALS_HISTORY",
  "FundamentalsHistory",
  "fundamentals/history",
]) {
  let i = -1;
  let n = 0;
  while ((i = s.indexOf(pat, i + 1)) !== -1 && n < 6) {
    console.log(`\n=== ${pat} @${i} ===`);
    console.log(s.slice(Math.max(0, i - 350), i + 350).replace(/\s+/g, " "));
    n++;
  }
}
