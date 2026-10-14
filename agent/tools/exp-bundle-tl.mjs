// 提取 bundle 里 tax_lot/get 与 scan_query/get 调用点参数
import { readFileSync } from "node:fs";
const s = readFileSync("agent/artifacts/frontend-index.js", "utf8");
for (const pat of ["TAX_LOT_GET,id:", "SCAN_QUERY_GET,id:"]) {
  let i = -1;
  let n = 0;
  while ((i = s.indexOf(pat, i + 1)) !== -1 && n < 4) {
    console.log(`\n=== ${pat} @${i} ===`);
    console.log(s.slice(Math.max(0, i - 420), i + 320).replace(/\s+/g, " "));
    n++;
  }
}
