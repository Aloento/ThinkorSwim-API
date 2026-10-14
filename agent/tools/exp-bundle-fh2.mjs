// 提取 bundle 中 fundamentals 字段枚举 l1 与 history 调用方字段清单
import { readFileSync } from "node:fs";
const s = readFileSync("agent/artifacts/frontend-index.js", "utf8");

// l1 枚举（COMPANY_BUSINESS_DESCRIPTION 结尾那个）
const end = s.indexOf('DESCRIPTION="COMPANY_BUSINESS_DESCRIPTION",e))(l1||{})');
if (end > 0) {
  const start = s.lastIndexOf("var l1=(e=>", end);
  console.log("=== l1 enum ===");
  console.log(
    s.slice(start >= 0 ? start : end - 3000, end + 50).replace(/\s+/g, " "),
  );
}

// getFundamentalsHistoryAC 调用点
for (const pat of ["getFundamentalsHistoryAC("]) {
  let i = -1;
  let n = 0;
  while ((i = s.indexOf(pat, i + 1)) !== -1 && n < 8) {
    console.log(`\n=== ${pat} @${i} ===`);
    console.log(s.slice(Math.max(0, i - 500), i + 300).replace(/\s+/g, " "));
    n++;
  }
}
