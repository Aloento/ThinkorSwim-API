import GenericIncomingMessageHandler from "../../client/services/genericIncomingMessageHandler.js";
import { RawPayloadResponse } from "../../client/tdaWsJsonTypes.js";
// 真实线上帧回放 fixture（录制于 2026-10-13 PaperMoney 会话，
// 源 agent/artifacts/probe-2026-10-13/*.jsonl，大数组已截断）
import quotesFrames from "../fixtures/quotes.frames.json";
import chartFrames from "../fixtures/chart.frames.json";
import depthFrames from "../fixtures/market_depth.frames.json";

const wrap = (item: unknown): RawPayloadResponse =>
  ({ payload: [item] }) as RawPayloadResponse;

describe("replay of recorded wire frames", () => {
  it("merges quotes snapshot + patches into cumulative state", () => {
    const handler = new GenericIncomingMessageHandler();
    const frames = quotesFrames as Array<Record<string, unknown>>;
    expect(frames.map((f) => (f.header as { type: string }).type)).toEqual([
      "snapshot",
      "patch",
      "patch",
    ]);

    const first = handler.parseResponse(wrap(frames[0]))[0];
    expect(first.service).toBe("quotes");
    expect(first.id).toBe("probe-quotes");
    const items = (first.body as { items: Array<{ symbol: string }> }).items;
    expect(items.length).toBeGreaterThan(0);
    const symbolsAfterSnapshot = items
      .map((i) => i.symbol)
      .sort()
      .join(",");

    // patch 帧应基于 snapshot 累积：每次解析都返回合并后的完整 body
    let lastBody = first.body as {
      items: Array<{ symbol: string; values: Record<string, unknown> }>;
    };
    for (const frame of frames.slice(1)) {
      const parsed = handler.parseResponse(wrap(frame));
      expect(parsed).toHaveLength(1);
      lastBody = parsed[0].body as typeof lastBody;
      // 合并后仍是完整文档（快照字段保留）
      expect(
        lastBody.items
          .map((i) => i.symbol)
          .sort()
          .join(","),
      ).toBe(symbolsAfterSnapshot);
      for (const item of lastBody.items) {
        expect(typeof item.values).toBe("object");
      }
    }
  });

  it("parses the real chart snapshot (candles column-store)", () => {
    const handler = new GenericIncomingMessageHandler();
    const frames = chartFrames as Array<Record<string, unknown>>;
    const parsed = handler.parseResponse(wrap(frames[0]));
    expect(parsed).toHaveLength(1);
    const body = parsed[0].body as {
      symbol: string;
      candles: Record<string, unknown[]>;
    };
    expect(body.symbol).toBe("AAPL");
    expect(Array.isArray(body.candles.timestamps)).toBe(true);
    expect(Array.isArray(body.candles.closes)).toBe(true);
  });

  it("parses market_depth with exchange-ladder arrays (sizeDecimal present)", () => {
    const handler = new GenericIncomingMessageHandler();
    const frames = depthFrames as Array<Record<string, unknown>>;
    const parsed = handler.parseResponse(wrap(frames[0]));
    const body = parsed[0].body as {
      askQuotes: Array<Record<string, unknown>>;
      bidQuotes: Array<Record<string, unknown>>;
    };
    expect(body.askQuotes.length).toBeGreaterThan(0);
    expect(typeof body.askQuotes[0].sizeDecimal).toBe("number");
    expect(body.bidQuotes.length).toBeGreaterThan(0);
  });

  it("routes error entries with the request id (real W4 cancel-error frame)", () => {
    // 来自 write-2026-10-13/W4.jsonl 的重复撤单错误帧（手工内联避免跨文件依赖）
    const handler = new GenericIncomingMessageHandler();
    const errorFrame = {
      header: {
        service: "cancel_order",
        id: "cancel-5411072868-again",
        ver: 0,
        type: "error",
      },
      body: {
        message:
          "Order #5411072868 has already been cancelled or is in a final state",
        isTerminal: true,
      },
    };
    const parsed = handler.parseResponse(wrap(errorFrame));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].error?.message).toContain("already been cancelled");
    expect(parsed[0].error?.isTerminal).toBe(true);
    expect(parsed[0].id).toBe("cancel-5411072868-again");
  });
});
