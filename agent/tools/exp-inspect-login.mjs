// 检查真实账户登录响应实形，token 类值脱敏，只看结构/键/refreshToken 去向
import { readFileSync } from "node:fs";
const j = JSON.parse(readFileSync("agent/artifacts/login-real.json", "utf8"));
const isSecretVal = (k, v) =>
  /token|refreshtoken|authcode|eat$|newt$/i.test(k) &&
  typeof v === "string" &&
  v.length > 8;
function shape(o, depth = 0) {
  const pad = "  ".repeat(depth);
  if (Array.isArray(o)) {
    if (o.length === 0) return "[]";
    return `[${o.length}] ` + shape(o[0], depth + 1);
  }
  if (o && typeof o === "object") {
    const lines = [];
    for (const [k, v] of Object.entries(o)) {
      if (isSecretVal(k, v)) lines.push(`${pad}${k}: <str:${v.length}>`);
      else if (v && typeof v === "object")
        lines.push(`${pad}${k}:`, shape(v, depth + 1));
      else lines.push(`${pad}${k}: ${JSON.stringify(v)}`);
    }
    return lines.join("\n");
  }
  return JSON.stringify(o);
}
console.log(shape(j));
