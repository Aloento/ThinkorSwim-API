// task-17 第4轮：drawing 系列收口——drawing 字段是否要求 JSON 字符串；
// drawings{guid} 只读可达性（drawing_sets 已在 round1 实测 ✅）。
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

let createdSetGuid = null;

const CASES = [
  {
    name: "drawing_set/create (get guid)",
    service: "drawing_set/create",
    params: { symbol: "AAPL", name: "ExpT17Set4" },
    captureGuid: true,
  },
  {
    name: "drawing/create drawing=JSON string",
    service: "drawing/create",
    params: {
      drawingSetGuid: "PENDING",
      drawing: JSON.stringify({
        drawingType: "VERTICAL",
        points: [{ price: 1, time: 0 }],
      }),
    },
    useCreatedSetGuid: true,
  },
  {
    name: "drawings {guid} (read-only)",
    service: "drawings",
    params: { guid: "PENDING" },
    useCreatedSetGuid: true,
    skipUnlessSetGuid: true,
  },
  {
    name: "drawing_set/delete cleanup",
    service: "drawing_set/delete",
    params: { guid: "PENDING", symbol: "AAPL" },
    useCreatedSetGuid: true,
    skipUnlessSetGuid: true,
  },
];

let loggedIn = false;
let idx = -1;
const results = [];
const pending = new Map();
const artDir = join(here, "..", "artifacts", "exp-t17");
mkdirSync(artDir, { recursive: true });
const artFile = join(artDir, "exp-t17-round4.jsonl");

function next() {
  idx++;
  if (idx >= CASES.length) {
    console.log("\n=== ROUND4 MATRIX ===");
    for (const r of results) console.log(r);
    process.exit(0);
  }
  const c = CASES[idx];
  if (c.skipUnlessSetGuid && !createdSetGuid) {
    results.push(`${c.name} -> SKIPPED`);
    setTimeout(next, 0);
    return;
  }
  const id = `t17d-${idx}`;
  pending.set(id, c);
  let params = c.params;
  if (c.useCreatedSetGuid && createdSetGuid) {
    params = JSON.parse(
      JSON.stringify(params).replaceAll("PENDING", createdSetGuid),
    );
  }
  appendFileSync(
    artFile,
    JSON.stringify({ t: Date.now(), dir: "send", id, params }) + "\n",
  );
  console.log(
    `\n[${idx}] ${c.name}\n  → ${JSON.stringify(params).slice(0, 220)}`,
  );
  ws.send(
    JSON.stringify({
      payload: [{ header: { service: c.service, id, ver: 0 }, params }],
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
    console.log("[exp-t17-r4] login OK");
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
      console.log(`  ← [${e.header.type}] ${body.slice(0, 300)}`);
      if (c.captureGuid && e.header.type === "snapshot") {
        createdSetGuid = e.body?.drawingSet?.guid ?? null;
        console.log(`  [guid=${createdSetGuid}]`);
      }
      if (e.header.type === "error") {
        results.push(
          `${c.name} -> ERROR: ${String(e.body?.message).slice(0, 160)}`,
        );
        pending.delete(e.header.id);
        setTimeout(next, 300);
      } else {
        results.push(
          `${c.name} -> ${e.header.type.toUpperCase()} body=${body.slice(0, 200)}`,
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
}, 120000);
