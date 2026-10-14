// 覆盖度审计（v2）：以 realWsJsonClient.ts 中 handler 类的**引用次数**判断接线状态。
// refs=0：连 import 都没有；refs≤2：只有 import + messageHandlers 注册（已注册未派发）；
// refs>2：还出现在 dispatchOneShot/dispatchHandler 等处 = 已接门面。
// v1 按门面文件的类型 import 匹配，零参 handler 无类型可 import 会假阳性——v2 消除。
import { readdirSync, readFileSync } from "node:fs";

const dir = "src/client/services";
const real = readFileSync("src/client/realWsJsonClient.ts", "utf8");

const rows = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
  if (f === "apiService.ts" || f === "webSocketApiMessageHandler.ts") continue;
  if (f.includes("generic") || f.includes("Incoming")) continue;
  const src = readFileSync(dir + "/" + f, "utf8");
  const classNames = [...src.matchAll(/export default class (\w+)/g)].map(
    (m) => m[1],
  );
  for (const cls of classNames) {
    const refs = (real.match(new RegExp(String.raw`\b${cls}\b`, "g")) || [])
      .length;
    const svc =
      (src.match(/service:\s*ApiService\s*=\s*"([^"]+)"/) || [])[1] ?? "?";
    rows.push({ cls, svc, file: f, refs });
  }
}

const unregistered = rows.filter((r) => r.refs === 0);
const registeredUnused = rows.filter((r) => r.refs > 0 && r.refs <= 2);
const wired = rows.filter((r) => r.refs > 2);

console.log(`handler classes total: ${rows.length}`);
console.log(`  wired (refs>2):         ${wired.length}`);
console.log(`  registered-unused(<=2): ${registeredUnused.length}`);
console.log(`  not even imported(0):   ${unregistered.length}`);
console.log("\n=== 注册了但从未被任何方法派发（候选缺失） ===");
for (const r of registeredUnused)
  console.log(`  ${r.svc}  ${r.cls} (${r.file}) refs=${r.refs}`);
if (!registeredUnused.length) console.log("  (none)");
console.log("\n=== 完全未引用 ===");
for (const r of unregistered) console.log(`  ${r.svc}  ${r.cls} (${r.file})`);
if (!unregistered.length) console.log("  (none)");
