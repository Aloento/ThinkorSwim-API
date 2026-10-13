import {
  RealWsJsonClient,
  CONNECTION_REQUEST_MESSAGE,
} from "../../client/realWsJsonClient";
import "dotenv/config";
import WS from "jest-websocket-mock";
import LoginMessageHandler from "../../client/services/loginMessageHandler";
import ResponseParser from "../../client/responseParser";
import WebSocketApiMessageHandler, {
  newPayload,
} from "../../client/services/webSocketApiMessageHandler";
import { ApiService } from "../../client/services/apiService";
import {
  RawPayloadRequest,
  RawPayloadResponse,
  WebSocketApiError,
} from "../../client/tdaWsJsonTypes";
import GenericIncomingMessageHandler from "../../client/services/genericIncomingMessageHandler";

const accessToken = "something-secret";
const refreshToken = "something-secret-refresh";
const fakeConnectionResponse = {
  session: "17a7_7115011e1b4a8c9c",
  build: "27.2323.3-B0",
  ver: "27.*.*",
};

const fakeLoginResponse = {
  payload: [
    {
      header: { service: "login", id: "login", ver: 0, type: "snapshot" },
      body: {
        authenticationStatus: "OK",
        authenticated: true,
        forceLogout: false,
        stalePassword: true,
        userDomain: "TDA",
        userSegment: "ADVNCED",
        userId: 123345566,
        userCdi: "A00000000000",
        userCode: "foobar",
        token: "something-random",
        schwabAccountMigrationValue: "REMAIN_ON_TDA",
        permissions: {
          isCryptoAllowed: false,
          isFractionalQuantityAllowed: false,
          isMandatoryAutoLockAllowed: false,
          isSchwabIntegrationHubLinkAllowed: true,
          isPlaceQuantityLinkOrdersAllowed: true,
        },
        quotePermissions: [
          {
            name: "Level I",
            isAllowed: true,
            children: [
              {
                name: "Stock",
                isAllowed: true,
                children: [
                  { name: "AMEX", isAllowed: true },
                  { name: "NASDAQ", isAllowed: true },
                  { name: "NYSE", isAllowed: true },
                ],
              },
              { name: "Equity options", isAllowed: true },
              {
                name: "Futures and futures options",
                isAllowed: true,
                children: [
                  { name: "CFE", isAllowed: true },
                  { name: "CME", isAllowed: true },
                  { name: "ICE EU", isAllowed: true },
                  { name: "ICE", isAllowed: true },
                  { name: "LIFFE", isAllowed: true },
                ],
              },
              { name: "Forex", isAllowed: true },
              { name: "Other", isAllowed: true },
            ],
          },
          { name: "Level II", isAllowed: true },
        ],
      },
    },
  ],
};

class FakeMessageHandler implements WebSocketApiMessageHandler<
  string,
  { service: "fake"; result: number } | null
> {
  constructor(public readonly id: string = "fake") {}

  buildRequest(value: string): RawPayloadRequest {
    return newPayload({
      header: { service: "fake", id: this.id, ver: 0 },
      params: { value },
    });
  }

  parseResponse(
    message: RawPayloadResponse,
  ): { service: "fake"; result: number } | null {
    const [{ body }] = message.payload as any;
    return { service: "fake", result: body.someMagicNumber };
  }

  // This service doesn't really exist and is just used for testing
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  service: ApiService = "fake";
}

/** Connects a fresh client to a mock server and logs it in. */
async function connectClient(
  url: string,
  { jsonProtocol = true }: { jsonProtocol?: boolean } = {},
): Promise<{
  server: WS;
  client: RealWsJsonClient;
}> {
  const server = new WS(url, { jsonProtocol });
  // With jsonProtocol disabled the mock server forwards frames verbatim and
  // receives raw strings, so both directions must be serialized manually.
  const encode = (msg: unknown) => (jsonProtocol ? msg : JSON.stringify(msg));
  const client = new RealWsJsonClient(
    {},
    new WebSocket(url),
    new ResponseParser(new GenericIncomingMessageHandler()),
  );
  await server.connected;
  // explicitly do not await for this promise so that we can send the server replies below
  client.authenticateWithAccessToken({ accessToken, refreshToken });
  server.send(encode(fakeConnectionResponse));
  server.send(encode(fakeLoginResponse));
  await expect(server).toReceiveMessage(encode(CONNECTION_REQUEST_MESSAGE));
  const loginMessageHandler = new LoginMessageHandler();
  await expect(server).toReceiveMessage(
    encode(loginMessageHandler.buildRequest(accessToken)),
  );
  return { server, client, encode };
}

describe("wsJsonClientTest", () => {
  afterEach(() => {
    WS.clean();
    jest.restoreAllMocks();
  });

  it("should connect and log in successfully", async () => {
    const url = "ws://localhost:1234";
    const { server, client } = await connectClient(url);
    try {
      expect(client.isConnected()).toBeTruthy();
    } finally {
      client.disconnect();
    }
    expect(client.isConnected()).toBeFalsy();
  });

  it("should register a message handler", async () => {
    const fakeResponse = {
      payload: [
        {
          header: { service: "fake", id: "fake", ver: 0, type: "snapshot" },
          body: { someMagicNumber: 42 },
        },
      ],
    };
    const fakeRequest = newPayload({
      header: { service: "fake", id: "fake", ver: 0 },
      params: { value: "wowowow" },
    });
    const url = "ws://localhost:1235";
    const { server, client } = await connectClient(url);
    try {
      const fakeMessageHandler = new FakeMessageHandler();
      const observable = client.dispatch(fakeMessageHandler, "wowowow");
      await expect(server).toReceiveMessage(fakeRequest);
      server.send(fakeResponse);
      const response = await observable.promise();
      expect(response).toEqual({
        body: { someMagicNumber: 42 },
        service: "fake",
        id: "fake",
      });
    } finally {
      client.disconnect();
    }
  });

  it("should reject the observable promise when the server sends an error frame", async () => {
    const url = "ws://localhost:1236";
    const { server, client } = await connectClient(url);
    try {
      const handler = new FakeMessageHandler("fake-error");
      const observable = client.dispatch(handler, "boom");
      await expect(server).toReceiveMessage(handler.buildRequest("boom"));
      // Kick off both a promise() consumer and an iterable() consumer before
      // the error frame arrives: both must terminate with the error.
      const promiseResult = observable.promise();
      const iterableNext = observable.iterable()[Symbol.asyncIterator]().next();
      // header.type === "error" with the same service+id as the request
      server.send({
        payload: [
          {
            header: {
              service: "fake",
              id: "fake-error",
              ver: 0,
              type: "error",
            },
            body: { message: "Undefined service: fake", isTerminal: true },
          },
        ],
      });
      await expect(promiseResult).rejects.toThrow("Undefined service: fake");
      await expect(iterableNext).rejects.toBeInstanceOf(WebSocketApiError);
    } finally {
      client.disconnect();
    }
  });

  it("should not cross-wire two concurrent requests on the same service with different ids", async () => {
    const url = "ws://localhost:1237";
    const { server, client } = await connectClient(url);
    try {
      const handlerA = new FakeMessageHandler("req-a");
      const handlerB = new FakeMessageHandler("req-b");
      const observableA = client.dispatch(handlerA, "a");
      const observableB = client.dispatch(handlerB, "b");
      await expect(server).toReceiveMessage(handlerA.buildRequest("a"));
      await expect(server).toReceiveMessage(handlerB.buildRequest("b"));

      // The responses arrive for both requests; each must only see its own.
      server.send({
        payload: [
          {
            header: { service: "fake", id: "req-b", ver: 0, type: "snapshot" },
            body: { someMagicNumber: 2 },
          },
        ],
      });
      server.send({
        payload: [
          {
            header: { service: "fake", id: "req-a", ver: 0, type: "snapshot" },
            body: { someMagicNumber: 1 },
          },
        ],
      });

      const responseB = await observableB.promise();
      const responseA = await observableA.promise();
      expect(responseB).toEqual({
        service: "fake",
        id: "req-b",
        body: { someMagicNumber: 2 },
      });
      expect(responseA).toEqual({
        service: "fake",
        id: "req-a",
        body: { someMagicNumber: 1 },
      });
    } finally {
      client.disconnect();
    }
  });

  it("should survive malformed frames and empty payloads without killing the stream", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const url = "ws://localhost:1238";
    // Use a plain (non json-protocol) server so we can emit raw garbage frames.
    const { server, client, encode } = await connectClient(url, {
      jsonProtocol: false,
    });
    try {
      const handler = new FakeMessageHandler("fake-resilient");
      const observable = client.dispatch(handler, "x");
      await expect(server).toReceiveMessage(encode(handler.buildRequest("x")));
      // A non-JSON garbage frame must be ignored, not fatal.
      server.send("this is {{{ not json");
      // A well-formed frame with an empty payload array must also be ignored.
      server.send(JSON.stringify({ payload: [] }));
      server.send(
        JSON.stringify({
          payload: [
            {
              header: {
                service: "fake",
                id: "fake-resilient",
                ver: 0,
                type: "snapshot",
              },
              body: { someMagicNumber: 7 },
            },
          ],
        }),
      );
      const response = await observable.promise();
      expect(response).toEqual({
        service: "fake",
        id: "fake-resilient",
        body: { someMagicNumber: 7 },
      });
      // The malformed/empty frames were reported instead of silently dropped.
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      client.disconnect();
    }
  });
});
