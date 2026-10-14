// task-17：黑盒复测剩余 🔧 服务（agent/08），逐个发 handler 的原样帧，
// 判定"参数被拒（可修真 bug）"vs"guest 权限受限（维持 🔧）"vs"服务端错"。
// 骨架仿 exp-fund-hist3.mjs：握手→login→逐帧试探。
import { config } from "dotenv";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, ".env.blackbox") });

const ws = new WebSocket(
  "wss://papermoney-services.schwab.com/Services/WsJson",
  {
    headers: {
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      Origin: "https://trade.thinkorswim.com",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
    },
  },
);
ws.on("open", () =>
  ws.send(
    JSON.stringify({
      ver: "27.*.*",
      fmt: "json-patches-structured",
      heartbeat: "2s",
    }),
  ),
);

// 每例 = 一个门面/handler 的真实形状参数（read-only 优先；写操作只发
// 校验探测或立即清理）。
const CASES = [
  {
    name: "study/subscribe studies[minimal name]",
    service: "study/subscribe",
    params: {
      symbols: ["AAPL"],
      type: "STUDY",
      studies: [{ name: "SimpleMovingAvg" }],
    },
    waitMs: 5000,
  },
  {
    name: "study/subscribe studies[name+parameters]",
    service: "study/subscribe",
    params: {
      symbols: ["AAPL"],
      type: "STUDY",
      studies: [{ name: "SimpleMovingAvg", parameters: { length: 20 } }],
    },
    waitMs: 5000,
  },
  {
    name: "study/subscribe studies[name+values]",
    service: "study/subscribe",
    params: {
      symbols: ["AAPL"],
      type: "STUDY",
      studies: [{ name: "SimpleMovingAvg", values: { length: 20 } }],
    },
    waitMs: 5000,
  },
  {
    name: "scan_query/get {watchlistId}",
    service: "scan_query/get",
    params: { watchlistId: 5795619 },
    waitMs: 6000,
  },
  {
    name: "news_headers/get_relevant handler params",
    service: "news_headers/get_relevant",
    params: { sortMode: "BY_RELEVANCE", symbols: ["AAPL"], limit: 5 },
    waitMs: 5000,
  },
  {
    name: "chat_global/subscribe exists?",
    service: "chat_global/subscribe",
    params: {},
    waitMs: 3000,
  },
  {
    name: "support_chat/messages {chatId:1}",
    service: "support_chat/messages",
    params: { chatId: 1 },
    waitMs: 4000,
  },
  {
    name: "tax_lot/get handler params",
    service: "tax_lot/get",
    params: {
      account: "D-12345678",
      symbol: "AAPL",
      taxLotFields: ["SYMBOL"],
      refreshToken: "t17probe",
    },
    waitMs: 5000,
  },
  {
    name: "tax_lot/update empty instructions",
    service: "tax_lot/update",
    params: { refreshToken: "t17probe", taxLotInstructions: [] },
    waitMs: 5000,
  },
  {
    name: "fundamentals/current time BOGUS(enum reveal)",
    service: "fundamentals/current",
    params: {
      symbol: "AAPL",
      time: "BOGUS",
      fields: ["EARNINGS_PER_SHARE_TTM"],
    },
    waitMs: 5000,
  },
  {
    name: "fundamentals/current time ANNUAL",
    service: "fundamentals/current",
    params: {
      symbol: "AAPL",
      time: "ANNUAL",
      fields: ["EARNINGS_PER_SHARE_TTM"],
    },
    waitMs: 5000,
  },
  {
    name: "drawing_set/create {symbol,name}",
    service: "drawing_set/create",
    params: { symbol: "AAPL", name: "ExpT17Set" },
    waitMs: 5000,
    // 记录成功时返回的 guid，供 drawings/drawing_set/delete 用
    captureGuid: true,
  },
  {
    name: "drawing_sets {symbol}",
    service: "drawing_sets",
    params: { symbol: "AAPL" },
    waitMs: 5000,
  },
  {
    name: "drawing/create drawing[minimal] (shape reveal)",
    service: "drawing/create",
    params: { drawingSetGuid: "PENDING", drawing: { drawingType: "VERTICAL" } },
    waitMs: 5000,
    useCreatedSetGuid: true,
  },
  {
    name: "drawing_set/delete cleanup（仅当 create 成功）",
    service: "drawing_set/delete",
    params: { guid: "PENDING", symbol: "AAPL" },
    waitMs: 5000,
    useCreatedSetGuid: true,
    skipUnlessSetGuid: true,
  },
];

let loggedIn = false;
let idx = -1;
const results = [];
const pending = new Map();
let createdSetGuid = null;

const artDir = join(here, "..", "artifacts", "exp-t17");
mkdirSync(artDir, { recursive: true });
const artFile = join(artDir, "exp-t17.jsonl");

function next() {
  idx++;
  if (idx >= CASES.length) {
    console.log("\n=== VERDICT MATRIX ===");
    for (const r of results) console.log(r);
    process.exit(0);
  }
  const c = CASES[idx];
  if (c.skipUnlessSetGuid && !createdSetGuid) {
    results.push(`${c.name} -> SKIPPED (no created set guid)`);
    setTimeout(next, 0);
    return;
  }
  const id = `t17-${idx}`;
  pending.set(id, c);
  let params = c.params;
  if (c.useCreatedSetGuid && createdSetGuid) {
    // 把参数里所有 "PENDING" 占位替换为捕获到的 guid
    params = JSON.parse(
      JSON.stringify(params).replaceAll("PENDING", createdSetGuid),
    );
  }
  appendFileSync(
    artFile,
    JSON.stringify({ t: Date.now(), dir: "send", id, svc: c.service, params }) +
      "\n",
  );
  console.log(
    `\n[${idx}] ${c.name}\n  → ${c.service} ${JSON.stringify(params).slice(0, 160)}`,
  );
  ws.send(
    JSON.stringify({
      payload: [{ header: { service: c.service, id, ver: 0 }, params }],
    }),
  );
  setTimeout(() => {
    if (pending.has(id)) {
      results.push(`${c.name} -> TIMEOUT (no response frame)`);
      pending.delete(id);
      next();
    }
  }, c.waitMs);
}

ws.on("message", (d) => {
  const msg = JSON.parse(d.toString());
  if (msg.heartbeat) return;
  if (!loggedIn && msg.session) {
    ws.send(
      JSON.stringify({
        payload: [
          {
            header: { service: "login", id: "login", ver: 0 },
            params: {
              token: process.env.TOS_GUEST_ACCESS_TOKEN,
              domain: "TOS",
              platform: "PROD",
              tag: "TOSWeb",
            },
          },
        ],
      }),
    );
    return;
  }
  if (msg.payload?.[0]?.body?.authenticationStatus === "OK") {
    loggedIn = true;
    console.log("[exp-t17] login OK");
    next();
    return;
  }
  if (msg.payload && loggedIn) {
    for (const e of msg.payload) {
      const c = pending.get(e.header?.id);
      if (!c) continue;
      const body = JSON.stringify(e.body ?? {});
      appendFileSync(
        artFile,
        JSON.stringify({
          t: Date.now(),
          dir: "recv",
          id: e.header.id,
          type: e.header.type,
          body,
        }) + "\n",
      );
      console.log(`  ← [${e.header.type}] ${body.slice(0, 240)}`);
      if (c.captureGuid && e.header.type === "snapshot") {
        createdSetGuid = e.body?.drawingSet?.guid ?? e.body?.guid ?? null;
        console.log(`  [captured drawingSetGuid=${createdSetGuid}]`);
      }
      if (e.header.type === "error") {
        results.push(
          `${c.name} -> ERROR: ${String(e.body?.message).slice(0, 140)}`,
        );
        pending.delete(e.header.id);
        setTimeout(next, 300);
      } else if (e.header.type === "snapshot") {
        results.push(`${c.name} -> SNAPSHOT body=${body.slice(0, 120)}`);
        pending.delete(e.header.id);
        setTimeout(next, 300);
      }
    }
  }
});

setTimeout(() => {
  console.log("GLOBAL TIMEOUT", results);
  process.exit(1);
}, 180000);
