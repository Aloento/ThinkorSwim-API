// 覆盖度审计：找出有 handler 但门面文件未引用的服务（候选缺失方法）
import { readdirSync, readFileSync } from "node:fs";

const dir = "src/client/services";
const reg = readFileSync("src/client/realWsJsonClient.ts", "utf8");
const facade = readFileSync("src/client/wsJsonClient.ts", "utf8");

// 门面实际 import 的 handler 文件名集合（去掉扩展名比较）
const facadeFiles = new Set(
  [...facade.matchAll(/services\/(\w+)\.js/g)].map((m) => m[1]),
);
// real client 注册的 handler 类名集合
const registeredClasses = new Set(
  [...reg.matchAll(/new (\w+)/g)].map((m) => m[1]),
);

const rows = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
  if (f === "apiService.ts" || f === "webSocketApiMessageHandler.ts") continue;
  if (f.includes("generic") || f.includes("Incoming")) continue;
  const src = readFileSync(dir + "/" + f, "utf8");
  const svcMatches = [
    ...src.matchAll(/service:\s*ApiService\s*=\s*"([^"]+)"/g),
  ].map((m) => m[1]);
  if (svcMatches.length === 0) continue; // 共享参数文件
  for (const svc of svcMatches) {
    const fileReferenced = facadeFiles.has(f.replace(/\.ts$/, ""));
    rows.push({ svc, file: f, inFacade: fileReferenced });
  }
}

const notInFacade = rows.filter((r) => !r.inFacade);
console.log("total service bindings:", rows.length);
console.log("handlers referenced by facade:", rows.length - notInFacade.length);
console.log("\n=== 有 handler 但门面未引用（候选缺失） ===");
for (const r of notInFacade) console.log(`  ${r.svc}  <- ${r.file}`);
if (!notInFacade.length) console.log("  (none)");
