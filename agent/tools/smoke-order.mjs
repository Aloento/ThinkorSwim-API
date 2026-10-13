// 用编译库 API 跑真实下单流（paper）：placeOrder（CONFIRM→SUBMIT 内部两步）→cancelOrder。
// 验证 T1 修复：placeOrder 的 promise 现在能 resolve 并拿到 orderId。
// 安全：$1 限价 1 股 AAPL（永不到来）+ 随后撤单。
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, ".env.blackbox") });

const { RealWsJsonClient, PAPER_WS_URL } = await import("../../dist/index.js");

const token = process.env.TOS_GUEST_ACCESS_TOKEN;
if (!token) {
  console.error("missing TOS_GUEST_ACCESS_TOKEN");
  process.exit(2);
}

const ACCOUNT_CODE = "D-12345678";

const client = new RealWsJsonClient({ wsUrl: PAPER_WS_URL });
await client.authenticateWithAccessToken({ accessToken: token });
console.log("[order] logged in");

console.log("[order] placing limit BUY 1 x AAPL @ $1 …");
let placed;
try {
  placed = await client.placeOrder({
    accountNumber: ACCOUNT_CODE,
    limitPrice: 1,
    symbol: "AAPL",
    quantity: 1,
  });
} catch (e) {
  console.log("[order] placeOrder rejected:", e?.message || e);
  client.disconnect();
  process.exit(1);
}
console.log("[order] placeOrder RESOLVED (T1 fix on live server):", JSON.stringify(placed?.body).slice(0, 160));

const orderId = placed?.body?.orderId;
if (orderId && orderId > 0) {
  console.log("[order] orderId:", orderId, "→ cancelling");
  const c = await client.cancelOrder(orderId);
  console.log("[order] cancel result:", c?.body?.result);
} else {
  console.log("[order] no orderId in response body — inspect:", JSON.stringify(placed).slice(0, 400));
}

client.disconnect();
process.exit(0);
