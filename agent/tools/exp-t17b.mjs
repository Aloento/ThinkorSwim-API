// task-17 第2轮：攻 study/subscribe 的 aggregationPeriod 取值（错误帧自曝
// studies 元素可用参数 = [plot, parameters, name, aggregationPeriod]）。
// 同时探 drawing/create 的 drawing 结构。
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

const study = (agg, extra = {}) => ({
  symbols: ["AAPL"],
  type: "STUDY",
  studies: [{ name: "SimpleMovingAvg", aggregationPeriod: agg, ...extra }],
});

const CASES = [
  { name: "agg='MIN1'", service: "study/subscribe", params: study("MIN1") },
  { name: "agg='HOUR1'", service: "study/subscribe", params: study("HOUR1") },
  { name: "agg='WEEK'", service: "study/subscribe", params: study("WEEK") },
  { name: "agg='MONTH'", service: "study/subscribe", params: study("MONTH") },
  {
    name: "agg='DAY'+parameters",
    service: "study/subscribe",
    params: study("DAY", { parameters: { length: 20 } }),
  },
  {
    name: "agg='DAY' + parameters + plot",
    service: "study/subscribe",
    params: study("DAY", {
      parameters: { length: 20 },
      plot: [{ name: "SimpleMovingAvg1", color: 0, style: "LINE" }],
    }),
  },
];

let loggedIn = false;
let idx = -1;
const results = [];
const pending = new Map();
const artDir = join(here, "..", "artifacts", "exp-t17");
mkdirSync(artDir, { recursive: true });
const artFile = join(artDir, "exp-t17-round2.jsonl");

function next() {
  idx++;
  if (idx >= CASES.length) {
    console.log("\n=== ROUND2 MATRIX ===");
    for (const r of results) console.log(r);
    process.exit(0);
  }
  const c = CASES[idx];
  const id = `t17b-${idx}`;
  pending.set(id, c);
  appendFileSync(
    artFile,
    JSON.stringify({ t: Date.now(), dir: "send", id, params: c.params }) + "\n",
  );
  console.log(
    `\n[${idx}] ${c.name}\n  → ${JSON.stringify(c.params).slice(0, 200)}`,
  );
  ws.send(
    JSON.stringify({
      payload: [
        { header: { service: c.service, id, ver: 0 }, params: c.params },
      ],
    }),
  );
  setTimeout(() => {
    if (pending.has(id)) {
      results.push(`${c.name} -> TIMEOUT (no response)`);
      pending.delete(id);
      next();
    }
  }, 6000);
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
    console.log("[exp-t17-r2] login OK");
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
      console.log(`  ← [${e.header.type}] ${body.slice(0, 260)}`);
      if (e.header.type === "error") {
        results.push(
          `${c.name} -> ERROR: ${String(e.body?.message).slice(0, 150)}`,
        );
        pending.delete(e.header.id);
        setTimeout(next, 300);
      } else {
        results.push(
          `${c.name} -> ${e.header.type.toUpperCase()} body=${body.slice(0, 150)}`,
        );
        pending.delete(e.header.id);
        setTimeout(next, 300);
      }
    }
  }
});

setTimeout(() => {
  console.log("GLOBAL TIMEOUT", results);
  process.exit(1);
}, 150000);
