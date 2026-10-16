import WS from "jest-websocket-mock";
import Authenticator, { AuthenticatorOptions } from "../../auth/authenticator";
import {
  CONNECTION_REQUEST_MESSAGE,
  RealWsJsonClient,
  RealWsJsonClientOptions,
} from "../../client/realWsJsonClient";
import ResponseParser from "../../client/responseParser";
import GenericIncomingMessageHandler from "../../client/services/genericIncomingMessageHandler";
import LoginMessageHandler from "../../client/services/loginMessageHandler";
import type { WsJsonClient } from "../../client/wsJsonClient";
import { AuthError } from "../../client/tdaWsJsonTypes";

/**
 * Authenticator token 续期。全部 mock——refreshChannel 注入 fake，无网络；
 * 客户端集成用例复用假定时器 + socketFactory 模式
 * （jest-websocket-mock 接管全局 WebSocket）。
 *
 * guest 会话无 refreshToken，端到端续期不可验证——直通分支（warn 一次）
 * 在单测覆盖。
 */

const clientId = "TOSWeb";

function makeAuthenticator(overrides: Partial<AuthenticatorOptions> = {}) {
  const refreshChannel = jest.fn(
    async ({ refreshToken }: { refreshToken: string }) => ({
      accessToken: `access-for-${refreshToken}`,
      refreshToken: `rotated-${refreshToken}`,
      accessExpiresIn: 86_400,
    }),
  );
  const authenticator = new Authenticator({
    clientId,
    initial: {
      accessToken: "access-0",
      refreshToken: "refresh-0",
      obtainedAt: Date.now(),
    },
    refreshChannel,
    ...overrides,
  });
  return { authenticator, refreshChannel };
}

describe("Authenticator (token 续期)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("未到期直通：不触发刷新通道", async () => {
    const { authenticator, refreshChannel } = makeAuthenticator();
    await expect(authenticator.getValidToken()).resolves.toBe("access-0");
    expect(refreshChannel).not.toHaveBeenCalled();
  });

  it("到期触发刷新：通道收到 refreshToken/scope/clientId，状态推进并回调 onTokenRotated", async () => {
    const onTokenRotated = jest.fn();
    const { authenticator, refreshChannel } = makeAuthenticator({
      initial: {
        accessToken: "access-0",
        refreshToken: "refresh-0",
        obtainedAt: Date.now() - 24 * 60 * 60 * 1000, // 超过 23h 阈值
      },
      onTokenRotated,
    });
    await expect(authenticator.getValidToken()).resolves.toBe(
      "access-for-refresh-0",
    );
    expect(refreshChannel).toHaveBeenCalledWith({
      refreshToken: "refresh-0",
      scope: "api",
      clientId,
    });
    // 新 token 对经 onTokenRotated 交出持久化（refreshToken 一次性，旧值作废）
    expect(onTokenRotated).toHaveBeenCalledWith({
      accessToken: "access-for-refresh-0",
      refreshToken: "rotated-refresh-0",
      accessExpiresIn: 86_400,
    });
    expect(authenticator.currentRefreshToken).toBe("rotated-refresh-0");
  });

  it("轮换后的旧 refreshToken 不再使用：刷新链上只出现最新值", async () => {
    // tokenTtlMs:-1 → 任何时刻都视为到期，可连续观察两轮刷新
    const { authenticator, refreshChannel } = makeAuthenticator({
      initial: { accessToken: "access-0", refreshToken: "refresh-0" },
      tokenTtlMs: -1,
    });
    await expect(authenticator.getValidToken()).resolves.toBe(
      "access-for-refresh-0",
    );
    await expect(authenticator.getValidToken()).resolves.toBe(
      "access-for-rotated-refresh-0",
    );
    const used = refreshChannel.mock.calls.map(([req]) => req.refreshToken);
    expect(used).toEqual(["refresh-0", "rotated-refresh-0"]);
  });

  it("无 refreshToken（guest）：直通现有 token，console.warn 恰好一次", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { authenticator, refreshChannel } = makeAuthenticator({
      initial: { accessToken: "guest-access", obtainedAt: 0 },
      refreshChannel: undefined,
    });
    await expect(authenticator.getValidToken()).resolves.toBe("guest-access");
    await expect(authenticator.getValidToken()).resolves.toBe("guest-access");
    expect(refreshChannel).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("刷新失败 → AuthError（保留原因）；失败不推进时钟，再次调用可重试", async () => {
    const refreshChannel = jest
      .fn()
      .mockRejectedValueOnce(new Error("refresh token revoked"))
      .mockRejectedValueOnce(new Error("refresh token revoked"))
      .mockResolvedValueOnce({ accessToken: "access-recovered" });
    const { authenticator } = makeAuthenticator({
      initial: { accessToken: "access-0", refreshToken: "refresh-0" },
      tokenTtlMs: -1,
      refreshChannel,
    });
    await expect(authenticator.getValidToken()).rejects.toThrow(AuthError);
    await expect(authenticator.getValidToken()).rejects.toThrow(
      /refresh token revoked/,
    );
    // 失败不推进 obtainedAt：下一次仍视为到期，重试成功
    await expect(authenticator.getValidToken()).resolves.toBe(
      "access-recovered",
    );
  });

  it("到期 + 有 refreshToken + 无刷新通道 → AuthError", async () => {
    const authenticator = new Authenticator({
      clientId,
      initial: {
        accessToken: "access-0",
        refreshToken: "refresh-0",
        obtainedAt: 1,
      },
      tokenTtlMs: 1,
    });
    await expect(authenticator.getValidToken()).rejects.toThrow(
      /no refresh channel/,
    );
  });

  it("缺省通道走注入客户端的 getAccessToken（access_token/get），body 字段映射", async () => {
    const getAccessToken = jest.fn().mockResolvedValue({
      service: "access_token/get",
      body: {
        accessToken: "access-via-wsjson",
        refreshToken: "refresh-via-wsjson",
        accessExpiresIn: 86_400,
      },
    });
    const authenticator = new Authenticator({
      clientId,
      initial: {
        accessToken: "access-0",
        refreshToken: "refresh-0",
        obtainedAt: 1,
      },
      tokenTtlMs: 1,
      channel: { getAccessToken } as unknown as WsJsonClient,
    });
    await expect(authenticator.getValidToken()).resolves.toBe(
      "access-via-wsjson",
    );
    expect(getAccessToken).toHaveBeenCalledWith({
      refreshToken: "refresh-0",
      scope: "api",
      clientId,
    });
    expect(authenticator.currentRefreshToken).toBe("refresh-via-wsjson");
  });

  it("access_token/get 响应缺 accessToken → AuthError", async () => {
    const getAccessToken = jest.fn().mockResolvedValue({
      service: "access_token/get",
      body: {},
    });
    const authenticator = new Authenticator({
      clientId,
      initial: {
        accessToken: "access-0",
        refreshToken: "refresh-0",
        obtainedAt: 1,
      },
      tokenTtlMs: 1,
      channel: { getAccessToken } as unknown as WsJsonClient,
    });
    await expect(authenticator.getValidToken()).rejects.toThrow(
      /missing accessToken/,
    );
  });

  it("onTokenRotated 抛错不影响取 token（持久化失败只 warn）", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { authenticator } = makeAuthenticator({
      initial: { accessToken: "access-0", refreshToken: "refresh-0" },
      tokenTtlMs: -1,
      onTokenRotated: () => {
        throw new Error("disk full");
      },
    });
    await expect(authenticator.getValidToken()).resolves.toBe(
      "access-for-refresh-0",
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("onTokenRotated"),
      expect.anything(),
    );
  });
});

// ---- 客户端集成：re-login 前挂 getValidToken ----

const WS_URL = "ws://localhost:9910";

const connectionResponse = {
  session: "17a7_r1test",
  build: "27.2323.3-B0",
  ver: "27.*.*",
};

const loginResponse = {
  payload: [
    {
      header: { service: "login", id: "login", ver: 0, type: "snapshot" },
      body: { authenticationStatus: "OK", authenticated: true },
    },
  ],
};

function setup(
  url: string,
  options: Partial<RealWsJsonClientOptions> = {},
): { server: WS; client: RealWsJsonClient } {
  const server = new WS(url, { jsonProtocol: true });
  const socketFactory = (
    factoryUrl: string,
    _headers: Record<string, string>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any => new (WebSocket as any)(factoryUrl);
  const client = new RealWsJsonClient(
    {
      wsUrl: url,
      handshakeTimeoutMs: 0,
      heartbeatTimeoutMs: 0,
      reconnectJitterRatio: 0,
      autoUnsubscribe: false,
      socketFactory,
      ...options,
    },
    undefined,
    new ResponseParser(new GenericIncomingMessageHandler()),
  );
  return { server, client };
}

async function waitFor(
  predicate: () => boolean,
  { maxMs = 60_000, stepMs = 5 } = {},
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > maxMs) {
      throw new Error("waitFor: timed out waiting for condition");
    }
    await jest.advanceTimersByTimeAsync(stepMs);
  }
}

describe("RealWsJsonClient × Authenticator（re-login 续期挂点）", () => {
  afterEach(async () => {
    await jest.advanceTimersByTimeAsync(50);
    jest.useRealTimers();
    WS.clean();
    jest.restoreAllMocks();
  });

  it("首轮握手：登录前经 getValidToken 刷新，login 帧携带新 token", async () => {
    jest.useFakeTimers();
    const { server, client } = setup(WS_URL);
    try {
      const refreshChannel = jest.fn(async () => ({
        accessToken: "refreshed-token",
        refreshToken: "refreshed-refresh",
      }));
      const auth = client.authenticateWithAccessToken({
        accessToken: "stale-token",
        refreshToken: "server-refresh",
      });
      auth.catch(() => undefined);
      // 握手进行中（connectionResponse 尚未发出）时挂上续期器
      client.setAuthenticator(
        new Authenticator({
          clientId,
          initial: {
            accessToken: "stale-token",
            refreshToken: "server-refresh",
            obtainedAt: Date.now() - 24 * 3600_000, // 已过期
          },
          refreshChannel,
        }),
      );
      await waitFor(() => server.messages.length >= 1);
      expect(server.messages[0]).toEqual(CONNECTION_REQUEST_MESSAGE);
      server.send(connectionResponse);
      // login 帧延迟到 refresh resolve 之后，且用的是刷新后的 token
      await waitFor(() => server.messages.length >= 2);
      expect(refreshChannel).toHaveBeenCalledWith({
        refreshToken: "server-refresh",
        scope: "api",
        clientId,
      });
      expect(server.messages[1]).toEqual(
        new LoginMessageHandler().buildRequest("refreshed-token"),
      );
      server.send(loginResponse);
      await waitFor(() => client.isConnected());
    } finally {
      client.disconnect();
    }
  });

  it("跨 24h 重连：re-login 前自动续期，新连接用轮换后的 token 登录", async () => {
    jest.useFakeTimers();
    const { server, client } = setup(WS_URL, {
      reconnectBackoffInitialMs: 100,
    });
    try {
      const refreshChannel = jest.fn(async () => ({
        accessToken: "day2-token",
        refreshToken: "day2-refresh",
      }));
      const onTokenRotated = jest.fn();
      const auth = client.authenticateWithAccessToken({
        accessToken: "day1-token",
        refreshToken: "day1-refresh",
      });
      auth.catch(() => undefined);
      client.setAuthenticator(
        new Authenticator({
          clientId,
          initial: {
            accessToken: "day1-token",
            refreshToken: "day1-refresh",
            obtainedAt: Date.now(),
          },
          refreshChannel,
          onTokenRotated,
        }),
      );
      await waitFor(() => server.messages.length >= 1);
      server.send(connectionResponse);
      await waitFor(() => server.messages.length >= 2);
      // 未到期：首轮登录直通旧 token，不刷新
      expect(server.messages[1]).toEqual(
        new LoginMessageHandler().buildRequest("day1-token"),
      );
      expect(refreshChannel).not.toHaveBeenCalled();
      server.send(loginResponse);
      await waitFor(() => client.isConnected());

      // 时间推进 24h（超过 23h 阈值）→ 断开 → 自动重连
      jest.setSystemTime(Date.now() + 24 * 3600_000);
      server.close();
      const server2 = new WS(WS_URL, { jsonProtocol: true });
      await waitFor(() => server2.messages.length >= 1);
      expect(server2.messages[0]).toEqual(CONNECTION_REQUEST_MESSAGE);
      server2.send(connectionResponse);
      await waitFor(() => server2.messages.length >= 2);
      // re-login 用的是续期后的新 token，且持久化回调收到新对
      expect(refreshChannel).toHaveBeenCalledWith({
        refreshToken: "day1-refresh",
        scope: "api",
        clientId,
      });
      expect(server2.messages[1]).toEqual(
        new LoginMessageHandler().buildRequest("day2-token"),
      );
      expect(onTokenRotated).toHaveBeenCalledWith({
        accessToken: "day2-token",
        refreshToken: "day2-refresh",
      });
      expect(client.accessToken).toBe("day2-token");
      server2.send(loginResponse);
      await waitFor(() => client.isConnected());
    } finally {
      client.disconnect();
    }
  });

  it("刷新失败（首轮）：authenticate reject AuthError，不发登录帧", async () => {
    jest.useFakeTimers();
    const { server, client } = setup(WS_URL);
    try {
      const refreshChannel = jest
        .fn()
        .mockRejectedValue(new Error("refresh token revoked"));
      const auth = client.authenticateWithAccessToken({
        accessToken: "stale-token",
        refreshToken: "server-refresh",
      });
      auth.catch(() => undefined);
      client.setAuthenticator(
        new Authenticator({
          clientId,
          initial: {
            accessToken: "stale-token",
            refreshToken: "server-refresh",
            obtainedAt: 1,
          },
          tokenTtlMs: 1,
          refreshChannel,
        }),
      );
      await waitFor(() => server.messages.length >= 1);
      server.send(connectionResponse);
      await expect(auth).rejects.toThrow(AuthError);
      await expect(auth).rejects.toThrow(/refresh token revoked/);
      // 会话被终止：login 帧从未发出
      expect(
        server.messages.filter((m) => JSON.stringify(m).includes('"login"')),
      ).toHaveLength(0);
    } finally {
      client.disconnect();
    }
  });
});
