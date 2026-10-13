import { ApiService } from "./services/apiService.js";
import { RawLoginResponse } from "./services/loginMessageHandler.js";

/** Known response entry types seen on the wire in `header.type`. */
export const RESPONSE_TYPE = {
  SNAPSHOT: "snapshot",
  PATCH: "patch",
  ERROR: "error",
} as const;

export type ResponseEntryType =
  (typeof RESPONSE_TYPE)[keyof typeof RESPONSE_TYPE];

/** Body of an error response entry (header.type === "error"), eg. a failed order cancellation. */
export type ResponseErrorBody = {
  message: string;
  isTerminal?: boolean;
};

/** Error surfaced when the server responds with an error entry (header.type === "error"). */
export class WebSocketApiError extends Error {
  public readonly service?: ApiService;
  public readonly requestId?: string;
  public readonly isTerminal?: boolean;

  constructor(
    message: string,
    details: {
      service?: ApiService;
      requestId?: string;
      isTerminal?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "WebSocketApiError";
    this.service = details.service;
    this.requestId = details.requestId;
    this.isTerminal = details.isTerminal;
  }
}

export type RawPayloadResponseItemHeader = {
  service: ApiService;
  id: string;
  ver: number;
  type: string;
};

export type RawPayloadResponseItem = {
  header: RawPayloadResponseItemHeader;
  body: Record<string, unknown>;
};

export type RawPayloadRequestItemHeader = {
  service: string;
  id: string;
  ver: number;
};

export type RawPayloadRequestItem = {
  header: RawPayloadRequestItemHeader;
  params: Record<string, any>;
};

export type ConnectionResponse = {
  session: string;
  build: string;
  ver: string;
};

export type RawHeartbeatResponse = { heartbeat: number };

export type RawPayloadResponse = { payload: RawPayloadResponseItem[] };

export type RawPayloadRequest = { payload: RawPayloadRequestItem[] };

export type WsJsonRawMessage =
  | RawHeartbeatResponse
  | ConnectionResponse
  | RawLoginResponse
  | RawPayloadResponse;

export type MessageHandlerBaseResponse = {
  service: ApiService;
};

export type ParsedWebSocketResponse = MessageHandlerBaseResponse;

export type ParsedPayloadResponse = {
  service: ApiService;
  /**
   * The `header.id` of the request this response entry belongs to, echoed back
   * by the server. Used to correlate responses with requests (and to keep
   * concurrent requests on the same service from crossing wires).
   */
  id?: string;
  body: Record<string, unknown>;
  /**
   * Present only when the raw entry had `header.type === "error"`.
   * Consumers waiting on this id should treat it as a rejection.
   */
  error?: ResponseErrorBody;
};
