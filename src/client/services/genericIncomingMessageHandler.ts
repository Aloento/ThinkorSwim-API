import debug from "debug";
import { ApiService } from "./apiService.js";
import {
  ParsedPayloadResponse,
  RawPayloadResponse,
  RESPONSE_TYPE,
  ResponseErrorBody,
} from "../tdaWsJsonTypes.js";
import pkg, { Operation } from "fast-json-patch";
const { applyPatch } = pkg;

type StoredData = Record<string, any>;

const logger = debug("genericIncomingMessageHandler");

export default class GenericIncomingMessageHandler {
  private readonly dataStore: Record<string, StoredData> = {};

  parseResponse({ payload }: RawPayloadResponse): ParsedPayloadResponse[] {
    // Defensive: a malformed frame may carry a missing/non-array payload.
    if (!Array.isArray(payload)) return [];
    const parsed: ParsedPayloadResponse[] = [];
    for (const entry of payload) {
      try {
        const header = entry?.header;
        if (!header) {
          console.warn(
            "⚠️ Received payload entry without a header, skipping: %o",
            entry,
          );
          continue;
        }
        const { service, id, ver, type } = header;
        const storeKey = `${service}_${id}_${ver}`;
        if (type === RESPONSE_TYPE.SNAPSHOT) {
          const body = (entry.body ?? {}) as StoredData;
          this.dataStore[storeKey] = body;
          parsed.push({ service, id, body: entry.body ?? {} });
        } else if (type === RESPONSE_TYPE.PATCH) {
          parsed.push(...this.parsePatch(storeKey, service, id, entry.body));
        } else if (type === RESPONSE_TYPE.ERROR) {
          // Error entries (eg. "Undefined service: xxx", failed order
          // cancellation) are surfaced to consumers waiting on this id
          // instead of being swallowed here.
          const body = (entry.body ?? {}) as Partial<ResponseErrorBody>;
          const message =
            typeof body.message === "string" && body.message.length > 0
              ? body.message
              : `Service ${service} (id=${id}) returned an error response`;
          parsed.push({
            service,
            id,
            body: entry.body ?? {},
            error: { message, isTerminal: body.isTerminal },
          });
        } else {
          console.warn(`Unknown message type: ${type}`);
        }
      } catch (e) {
        // A single malformed entry must not abort the remaining entries.
        console.warn("⚠️ Failed to parse payload entry, skipping: ", e);
      }
    }
    return parsed;
  }

  private parsePatch(
    storeKey: string,
    service: ApiService,
    id: string,
    rawBody: unknown,
  ): ParsedPayloadResponse[] {
    const patches = (rawBody as { patches?: Operation[] } | undefined)?.patches;
    if (!Array.isArray(patches)) {
      console.warn(
        `⚠️ Patch message for ${storeKey} is missing a "patches" array, skipping`,
      );
      return [];
    }
    const existingObject = this.dataStore[storeKey];
    if (!existingObject) {
      // Patch received before (or without) its snapshot base: warn loudly with
      // diagnostics instead of silently corrupting state, then continue.
      console.warn(
        `⚠️ Received patch for ${storeKey} without a snapshot base; ` +
          `applying ${patches.length} patch(es) to an empty document. ` +
          `The resulting body may be incomplete.`,
      );
      logger("patch without base: key=%s patches=%O", storeKey, patches);
    }
    try {
      const { newDocument } = applyPatch(
        existingObject ?? {},
        patches,
        /* validateOperation */ false,
      );
      this.dataStore[storeKey] = newDocument;
      return [{ service, id, body: newDocument ?? {} }];
    } catch (e) {
      console.warn(
        `⚠️ Failed to apply patch for ${storeKey}, skipping entry: `,
        e,
      );
      return [];
    }
  }
}
