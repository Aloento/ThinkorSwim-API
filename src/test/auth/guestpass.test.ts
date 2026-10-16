import {
  waitForTsmAuthorize,
  wsUrlForTradingSystem,
  BrowserPage,
  BrowserResponse,
} from "../../auth/guestpass.js";

// 最小假 page/response：避免测试依赖 puppeteer
class FakePage implements BrowserPage {
  private listeners: Array<(res: BrowserResponse) => void> = [];
  on(event: "response", listener: (res: BrowserResponse) => void): void {
    if (event === "response") this.listeners.push(listener);
  }
  off(event: "response", listener: (res: BrowserResponse) => void): void {
    if (event === "response")
      this.listeners = this.listeners.filter((l) => l !== listener);
  }
  emit(res: BrowserResponse): void {
    [...this.listeners].forEach((l) => l(res));
  }
  get listenerCount(): number {
    return this.listeners.length;
  }
}

const fakeResponse = (
  url: string,
  status: number,
  body: unknown,
): BrowserResponse => ({
  url: () => url,
  status: () => status,
  json: async () => body,
});

describe("guestpass auth helpers", () => {
  it("resolves with authCode from tsm/authorize 201 response", async () => {
    const page = new FakePage();
    const { promise } = waitForTsmAuthorize(page, 5000);
    page.emit(
      fakeResponse(
        "https://tosweb-sm.thinkorswim.com/api/v1/tsm/authorize",
        201,
        { authCode: "C0.newcode", newT: "S0.t", newTExpireTime: 1 },
      ),
    );
    const creds = await promise;
    expect(creds.authCode).toBe("C0.newcode");
    expect(creds.clientId).toBe("TOSGuestPassWeb");
    expect(creds.authorize.newTExpireTime).toBe(1);
    // 结算后监听器已摘除
    expect(page.listenerCount).toBe(0);
  });

  it("ignores non-matching responses", async () => {
    const page = new FakePage();
    const { promise, cancel } = waitForTsmAuthorize(page, 5000);
    page.emit(
      fakeResponse("https://example.com/other", 201, { authCode: "x" }),
    );
    page.emit(
      fakeResponse(
        "https://tosweb-sm.thinkorswim.com/api/v1/tsm/authorize",
        200,
        {
          authCode: "wrong-status",
        },
      ),
    );
    page.emit(
      fakeResponse(
        "https://tosweb-sm.thinkorswim.com/api/v1/tsm/authorize",
        201,
        {
          nope: true,
        },
      ),
    );
    // 最后一条才是有效帧
    page.emit(
      fakeResponse(
        "https://tosweb-sm.thinkorswim.com/api/v1/tsm/authorize",
        201,
        {
          authCode: "valid",
        },
      ),
    );
    const creds = await promise;
    expect(creds.authCode).toBe("valid");
    cancel();
  });

  it("rejects on timeout", async () => {
    const page = new FakePage();
    const { promise } = waitForTsmAuthorize(page, 50);
    await expect(promise).rejects.toThrow(/not seen within 50ms/);
    expect(page.listenerCount).toBe(0);
  });

  it("cancel removes the listener", () => {
    const page = new FakePage();
    const { cancel } = waitForTsmAuthorize(page, 5000);
    expect(page.listenerCount).toBe(1);
    cancel();
    expect(page.listenerCount).toBe(0);
  });

  it("picks the papermoney datacenter for PaperMoney sessions", () => {
    // token 与 DC 绑定：paper 会话必须连 papermoney-services
    expect(wsUrlForTradingSystem("PaperMoney")).toBe(
      "wss://papermoney-services.schwab.com/Services/WsJson",
    );
    expect(wsUrlForTradingSystem("Live")).toBe(
      "wss://thinkorswim-services.schwab.com/Services/WsJson",
    );
    expect(wsUrlForTradingSystem(undefined)).toBe(
      "wss://thinkorswim-services.schwab.com/Services/WsJson",
    );
  });
});
