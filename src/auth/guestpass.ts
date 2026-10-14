// guestpass 认证辅助（纯协议侧，不依赖 puppeteer——浏览器注入式，调用方传 page）。
//
// 实测流程（docs/TECHNICAL.md 第 1 节）：
//   表单登录 → sws-gateway auth/login+assert → 302 /oauth?code=X
//   → 前端 POST tosweb-sm…/tsm/authorize {authCode:X, clientId}
//   → 201 {authCode:Y,…}   ← Y 是 wsjson login/schwab 要用的 code
// 本模块的职责：在浏览器导航过程中截获 tsm/authorize 的 201 响应，
// 返回 {authCode, clientId}；wsjson 登录仍走 WsJsonClient.authenticateWithAuthCode。
//
// 浏览器对象类型刻意用最小结构（duck typing），避免把 puppeteer 变成运行时依赖。

/** puppeteer Page 的最小必需面（createCDPSession 不需要）。 */
export interface BrowserPage {
  on(event: "response", listener: (res: BrowserResponse) => void): void;
  off?(event: "response", listener: (res: BrowserResponse) => void): void;
}

export interface BrowserResponse {
  url(): string;
  status(): number;
  json(): Promise<unknown>;
}

export type TsmAuthorizeResponse = {
  authCode: string;
  eat?: string;
  eatExpireTime?: number;
  newT?: string;
  newTExpireTime?: number;
};

export type GuestpassCredentials = {
  /** wsjson login/schwab 要用的 authCode（tsm/authorize 201 响应里的新 code） */
  authCode: string;
  clientId: string;
  /** tsm/authorize 原始响应（含 eat/newT/过期时间，供上层实现 token 续期） */
  authorize: TsmAuthorizeResponse;
};

export const GUESTPASS_URL = "https://trade.thinkorswim.com/guestpass";
export const TOS_CLIENT_ID = "TOSGuestPassWeb";
export const TSM_AUTHORIZE_PATH = "/api/v1/tsm/authorize";
/** 前端把 wsjson 复用 token 写在这个 sessionStorage key（guest 兜底收割路径） */
export const SESSION_TOKEN_KEY = "token";

/**
 * 注册监听：截获 tsm/authorize 201 响应并 resolve。
 * 必须在 page.goto 之前调用（authCode 是一次性的，页面自己也会消费）。
 * 返回 promise 与取消函数。
 */
export function waitForTsmAuthorize(
  page: BrowserPage,
  timeoutMs = 120_000,
): { promise: Promise<GuestpassCredentials>; cancel: () => void } {
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settle: (fn: () => void) => void;

  const promise = new Promise<GuestpassCredentials>((resolve, reject) => {
    settle = (finish) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      page.off?.("response", onResponse);
      finish();
    };
    const onResponse = (res: BrowserResponse) => {
      if (!res.url().includes(TSM_AUTHORIZE_PATH) || res.status() !== 201)
        return;
      void res
        .json()
        .then((body) => {
          const tsm = body as TsmAuthorizeResponse;
          if (!tsm?.authCode) return;
          settle(() =>
            resolve({
              authCode: tsm.authCode,
              clientId: TOS_CLIENT_ID,
              authorize: tsm,
            }),
          );
        })
        .catch(() => {
          /* 非 JSON 或 body 已被消费：忽略，等下一帧 */
        });
    };
    page.on("response", onResponse);
    timer = setTimeout(
      () =>
        settle(() =>
          reject(new Error(`tsm/authorize 201 not seen within ${timeoutMs}ms`)),
        ),
      timeoutMs,
    );
  });

  return {
    promise,
    cancel: () => settle(() => {}),
  };
}

/**
 * 从已登录页面收割 wsjson 复用 token（guest 兜底路径）。
 * browserLike 需提供 pages()；每个 page 需提供主 frame 的 evaluate。
 * 返回 {token, tradingSystem}；找不到返回 null。
 */
export async function harvestSessionToken(browserLike: {
  pages(): Promise<
    Array<BrowserPage & { evaluate?: (fn: () => unknown) => Promise<unknown> }>
  >;
}): Promise<{ token: string; tradingSystem?: string } | null> {
  for (const page of await browserLike.pages()) {
    const evaluate = page.evaluate?.bind(page);
    if (!evaluate) continue;
    try {
      const got = (await evaluate(() => ({
        token: sessionStorage.getItem("token"),
        tradingSystem: sessionStorage.getItem("tradingSystem"),
      }))) as { token?: string | null; tradingSystem?: string | null } | null;
      if (got?.token) {
        return {
          token: got.token,
          tradingSystem: got.tradingSystem ?? undefined,
        };
      }
    } catch {
      // frame detached 等情况：跳过该 page
    }
  }
  return null;
}

/** PaperMoney 会话必须连 papermoney 数据中心（token 与 DC 绑定，见 docs/TECHNICAL.md F1）。 */
export function wsUrlForTradingSystem(tradingSystem?: string): string {
  return tradingSystem === "PaperMoney"
    ? "wss://papermoney-services.schwab.com/Services/WsJson"
    : "wss://thinkorswim-services.schwab.com/Services/WsJson";
}
