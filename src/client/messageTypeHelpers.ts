import {
  ConnectionResponse,
  ParsedPayloadResponse,
  RawPayloadResponse,
  WsJsonRawMessage,
} from "./tdaWsJsonTypes.js";
import { RawLoginResponse } from "./services/loginMessageHandler.js";

export function isPayloadResponse(
  response: WsJsonRawMessage,
): response is RawPayloadResponse {
  return (
    response != null &&
    typeof response === "object" &&
    "payload" in response &&
    Array.isArray((response as RawPayloadResponse).payload)
  );
}

/**
 * Returns the header of the first payload entry, or undefined when the
 * message is not a payload response or its payload array is missing/empty.
 * Guards against malformed frames (payload: [] or payload missing).
 */
function firstEntryHeader(message: WsJsonRawMessage) {
  if (!isPayloadResponse(message)) return undefined;
  const [entry] = message.payload ?? [];
  return entry?.header;
}

export function isConnectionResponse(
  message: WsJsonRawMessage,
): message is ConnectionResponse {
  return (
    message != null &&
    typeof message === "object" &&
    "session" in message &&
    "build" in message &&
    "ver" in message
  );
}

export function isLoginResponse(
  message: WsJsonRawMessage,
): message is RawLoginResponse {
  const header = firstEntryHeader(message);
  return header?.service === "login";
}

export function isSchwabLoginResponse(
  message: WsJsonRawMessage,
): message is RawLoginResponse {
  const header = firstEntryHeader(message);
  return header?.service === "login/schwab";
}

/**
 * Checks whether a parsed response entry belongs to a request identified by
 * `service` + `id`. Matching rules, in order:
 *  - the service names must match;
 *  - if the request had an id and the response carries one, the ids must
 *    match too (this is what keeps two concurrent requests on the same
 *    service from crossing wires);
 *  - a response without an id (older/lenient servers) still matches by
 *    service alone, preserving the legacy streaming semantics.
 */
export function isResponseForRequest(
  msg: Pick<ParsedPayloadResponse, "service" | "id">,
  requestService?: string,
  requestId?: string,
): boolean {
  if (msg.service !== requestService) return false;
  if (requestId !== undefined && msg.id !== undefined) {
    return msg.id === requestId;
  }
  return true;
}
