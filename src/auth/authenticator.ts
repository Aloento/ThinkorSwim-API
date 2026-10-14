// Authenticator：token 自动续期抽象（R1，agent/05 阶段 1）。
//
// 背景：wsjson login/schwab 响应携带 accessTokenInfo.refreshToken（agent/06
// F4），续期通道 access_token/get（refreshToken 换 accessToken）handler 已
// 落地。实测口径：accessToken 约 24h 有效——在 23h 阈值前主动刷新，长连接
// 会话即可跨天存活。
//
// guest 局限（agent/06）：guest 会话无 refreshToken，getValidToken() 走直通
// 分支（console.warn 一次，不刷新）——**端到端续期回归需真实账户**（已在
// agent/05 与 README 标注）。
//
// 注意：不引用任何 REST 续期通道——grant_type=refresh_token 的 REST 路径未
// 实测（src/auth/refresh.mjs 不存在），按 YAGNI 不做；wsjson 的
// access_token/get 通道已足够。
//
// 真实账户端到端实测（2026-10-14，agent/tools/exp-auth-refresh.mjs）：
// - refreshToken 只在 F2A 勾选"信任设备"时签发（login/schwab 帧
//   accessTokenInfo.refreshToken，len≈248~268）。
// - 续期成功：{accessExpiresIn:86400, accessToken, refreshToken}，且
//   refreshToken 一次性轮换（链式二次续期验证通过——新 RT 立即可用，旧 RT
//   失效）。
// - **重要语义**：续出的 accessToken 是 EAT（855+ 字符，"S0." 前缀），供
//   EAT 鉴权的 REST/服务使用；它**不是** wsjson login 帧的 32 字符 session
//   token（拿它 login 报 NOT_AUTHORIZED: Invalid token (server session id)）。
//   wsjson 会话 token 另有生命周期，到期需重新走登录（或 tsm 授权链）。

import { AuthError, ParsedPayloadResponse } from "../client/tdaWsJsonTypes.js";
import { RawPayloadResponseAccessTokenGet } from "../client/services/accessTokenGetMessageHandler.js";
import type { WsJsonClient } from "../client/wsJsonClient.js";

/** accessToken 有效期约 24h，提前 1h 视为到期（实测口径，agent/06）。 */
export const DEFAULT_TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

/**
 * 真实账户实测（2026-10-14，agent/tools/exp-token-scope.mjs）：
 * access_token/get 的 scope 合法值为 "api"；"GENERAL"（guest OAuth REST
 * 侧常用值）被服务端拒 "NOT_AUTHORIZED: Unrecognized scope"。
 */
export const DEFAULT_REFRESH_SCOPE = "api";

export type AuthTokenPair = {
  accessToken: string;
  /** guest 会话没有 refreshToken——缺省即不可续期 */
  refreshToken?: string;
  /** accessToken 获取时刻（epoch ms），缺省视为"刚刚获取" */
  obtainedAt?: number;
};

export type TokenRefreshResult = {
  accessToken: string;
  refreshToken?: string;
  /** 服务端回传有效期（秒）；仅记录用，TTL 判定仍以 tokenTtlMs 阈值为准 */
  accessExpiresIn?: number;
};

/**
 * 刷新通道：refreshToken → 新 token 对。默认实现走注入客户端的
 * getAccessToken（access_token/get，wsjson 通道）；测试注入 fake，真实账户
 * 也可注入其他实现（如离线 REST，若日后实测）。
 */
export type TokenRefreshChannel = (request: {
  refreshToken: string;
  scope: string;
  clientId: string;
}) => Promise<TokenRefreshResult>;

export type AuthenticatorOptions = {
  /** OAuth clientId，access_token/get 必填项 */
  clientId: string;
  initial: AuthTokenPair;
  refreshChannel?: TokenRefreshChannel;
  /** 到期阈值，默认 23h（DEFAULT_TOKEN_TTL_MS） */
  tokenTtlMs?: number;
  /** access_token/get 的 scope，默认 "api"（真实账户实测值） */
  scope?: string;
  /**
   * 持有一个已连接的客户端：缺省刷新通道走它的 getAccessToken
   * （access_token/get）。与显式 refreshChannel 同时给出时，
   * refreshChannel 优先。
   */
  channel?: WsJsonClient;
  /**
   * 刷新成功回调。**refreshToken 是一次性轮换的——旧的立即失效，调用方
   * 必须把新 token 对持久化**（写 .env / 存储），否则下次登录用的是
   * 已作废的 refreshToken。
   */
  onTokenRotated?: (tokens: TokenRefreshResult) => void;
};

export default class Authenticator {
  private readonly clientId: string;
  private readonly tokenTtlMs: number;
  private readonly scope: string;
  private readonly refreshChannel?: TokenRefreshChannel;
  private readonly onTokenRotated?: (tokens: TokenRefreshResult) => void;
  private accessToken: string;
  private refreshToken?: string;
  private obtainedAt: number;
  private warnedNoRefreshToken = false;

  constructor(options: AuthenticatorOptions) {
    this.clientId = options.clientId;
    this.accessToken = options.initial.accessToken;
    this.refreshToken = options.initial.refreshToken;
    // 缺省视为"刚刚获取"：未到期，直通现有 token
    this.obtainedAt = options.initial.obtainedAt ?? Date.now();
    this.tokenTtlMs = options.tokenTtlMs ?? DEFAULT_TOKEN_TTL_MS;
    this.scope = options.scope ?? DEFAULT_REFRESH_SCOPE;
    this.onTokenRotated = options.onTokenRotated;
    this.refreshChannel =
      options.refreshChannel ??
      (options.channel
        ? Authenticator.wsJsonChannel(options.channel)
        : undefined);
  }

  /** 缺省刷新通道：access_token/get（wsjson 服务，已验证存在） */
  private static wsJsonChannel(client: WsJsonClient): TokenRefreshChannel {
    return async ({ refreshToken, scope, clientId }) => {
      const response: ParsedPayloadResponse = await client.getAccessToken({
        refreshToken,
        scope,
        clientId,
      });
      const body = response.body as
        RawPayloadResponseAccessTokenGet | undefined;
      if (!body?.accessToken) {
        throw new AuthError(
          "access_token/get response is missing accessToken, cannot refresh",
        );
      }
      return {
        accessToken: body.accessToken,
        refreshToken: body.refreshToken,
        accessExpiresIn: body.accessExpiresIn,
      };
    };
  }

  /**
   * 取当前有效 accessToken：未到期直通；到期且有 refreshToken → 走刷新通道
   * （成功更新内部状态并回调 onTokenRotated）；刷新失败抛 AuthError；
   * 无 refreshToken（guest）→ 直通现有 token，console.warn 一次。
   * 注意：刷新后返回的是 EAT（见文件头实测口径），与直通时的原始 token
   * 类型不同。
   */
  async getValidToken(): Promise<string> {
    if (!this.refreshToken) {
      if (!this.warnedNoRefreshToken) {
        this.warnedNoRefreshToken = true;
        console.warn(
          "Authenticator: no refreshToken (guest session?), token renewal is not possible; " +
            "the connection will fail once the access token expires.",
        );
      }
      return this.accessToken;
    }
    if (Date.now() - this.obtainedAt <= this.tokenTtlMs) {
      return this.accessToken;
    }
    if (!this.refreshChannel) {
      throw new AuthError(
        "token expired but no refresh channel available " +
          "(provide refreshChannel or channel to Authenticator)",
      );
    }
    let refreshed: TokenRefreshResult;
    try {
      refreshed = await this.refreshChannel({
        refreshToken: this.refreshToken,
        scope: this.scope,
        clientId: this.clientId,
      });
    } catch (e) {
      throw new AuthError(
        `token refresh via access_token/get failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
    if (!refreshed?.accessToken) {
      throw new AuthError(
        "token refresh returned no accessToken via access_token/get",
      );
    }
    // 状态推进在 onTokenRotated 之前：回调里抛错也不能回滚——旧
    // refreshToken 已被服务端消费，回滚只会让下次刷新注定失败。
    this.accessToken = refreshed.accessToken;
    if (refreshed.refreshToken) {
      this.refreshToken = refreshed.refreshToken;
    }
    this.obtainedAt = Date.now();
    try {
      this.onTokenRotated?.(refreshed);
    } catch (e) {
      console.warn("Authenticator: onTokenRotated callback threw: %O", e);
    }
    return this.accessToken;
  }

  /** 当前 refreshToken（轮换后的最新值；guest 为 undefined） */
  get currentRefreshToken(): string | undefined {
    return this.refreshToken;
  }

  /**
   * 外部（如 login/schwab 响应）轮换过 token 后同步进来；obtainedAt 重置为
   * 当前时刻。
   */
  updateTokens(pair: AuthTokenPair): void {
    this.accessToken = pair.accessToken;
    if (pair.refreshToken !== undefined) {
      this.refreshToken = pair.refreshToken;
    }
    this.obtainedAt = pair.obtainedAt ?? Date.now();
  }
}
