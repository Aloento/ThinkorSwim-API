import type WebSocket from "ws";
import WsJsonServerProxy from "../../server/wsJsonServerProxy";
import { WsJsonClient } from "../../client/wsJsonClient";
import { ParsedPayloadResponse } from "../../client/tdaWsJsonTypes";

// S1/S3（task-15）代理安全闸门单测：token 鉴权 + request 白名单。
// 用假 downstream（WsJsonServerProxy 只依赖 on/send/close），避免真实
// 端口与计时器；upstream 用最小 fake 客户端。

class FakeDownstream {
  sent: unknown[] = [];
  closed = false;
  private handlers: Record<string, (data: never) => void> = {};

  on(event: string, cb: (data: never) => void) {
    this.handlers[event] = cb;
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.closed = true;
  }

  /** 模拟 downstream "message" 事件（入参对象会被 JSON 编码，与真实 ws 一致） */
  deliver(msg: unknown) {
    this.handlers["message"](JSON.stringify(msg) as never);
  }

  lastSent(): Record<string, unknown> {
    return this.sent[this.sent.length - 1] as Record<string, unknown>;
  }
}

const fakeUpstream = {
  authenticateWithAccessToken(): Promise<unknown> {
    return Promise.resolve({ authenticationStatus: "OK" });
  },
  getAccounts(): Promise<ParsedPayloadResponse> {
    return Promise.resolve({ service: "accounts", body: { items: [] } });
  },
  disconnect() {},
} as unknown as WsJsonClient;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildProxy(options?: { authToken?: string }) {
  const downstream = new FakeDownstream();
  new WsJsonServerProxy(
    downstream as unknown as WebSocket,
    () => fakeUpstream,
    options,
  );
  return downstream;
}

describe("WsJsonServerProxy security (task-15)", () => {
  it("设置 authToken 后，缺 token 的消息回 unauthorized 并断开", async () => {
    const downstream = buildProxy({ authToken: "s3cret" });
    downstream.deliver({ request: "getAccounts" });
    await sleep(10);
    expect(downstream.lastSent()).toEqual({ error: "unauthorized" });
    expect(downstream.closed).toBe(true);
    expect(downstream.sent).toHaveLength(1); // 不得有 relay 响应
  });

  it("设置 authToken 后，带正确 token 的消息正常放行", async () => {
    const downstream = buildProxy({ authToken: "s3cret" });
    // upstream 只由 authenticate 分支建立——先走一次认证。
    downstream.deliver({
      request: "authenticateWithAccessToken",
      args: { accessToken: "t" },
      token: "s3cret",
    });
    downstream.deliver({ request: "getAccounts", token: "s3cret" });
    await sleep(10);
    expect(downstream.lastSent()).toMatchObject({
      request: "getAccounts",
      response: { service: "accounts" },
    });
    expect(downstream.closed).toBe(false);
  });

  it("token 不匹配同样拒绝并断开", async () => {
    const downstream = buildProxy({ authToken: "s3cret" });
    downstream.deliver({ request: "getAccounts", token: "wrong" });
    await sleep(10);
    expect(downstream.lastSent()).toEqual({ error: "unauthorized" });
    expect(downstream.closed).toBe(true);
  });

  it("未知 request 回 unknown request（白名单），连接保留", async () => {
    const downstream = buildProxy();
    downstream.deliver({ request: "notAMethod" });
    await sleep(10);
    expect(downstream.lastSent()).toEqual({ error: "unknown request" });
    expect(downstream.closed).toBe(false);
  });

  it("未设置 authToken 时保持现状（无 token 消息放行）", async () => {
    const downstream = buildProxy();
    downstream.deliver({
      request: "authenticateWithAccessToken",
      args: { accessToken: "t" },
    });
    downstream.deliver({ request: "getAccounts" });
    await sleep(10);
    expect(downstream.lastSent()).toMatchObject({
      request: "getAccounts",
      response: { service: "accounts" },
    });
  });

  it("非法 JSON 回 invalid json，不再 unhandled rejection", async () => {
    const downstream = new FakeDownstream();
    new WsJsonServerProxy(
      downstream as unknown as WebSocket,
      () => fakeUpstream,
    );
    downstream.handlers["message"]("{not json" as never);
    await sleep(10);
    expect(downstream.lastSent()).toEqual({ error: "invalid json" });
    expect(downstream.closed).toBe(false);
  });
});
