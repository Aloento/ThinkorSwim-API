import { ParsedPayloadResponse, WsJsonRawMessage } from "./tdaWsJsonTypes.js";
import { isPayloadResponse } from "./messageTypeHelpers.js";
import GenericIncomingMessageHandler from "./services/genericIncomingMessageHandler.js";

export default class ResponseParser {
  constructor(private readonly genericHandler: GenericIncomingMessageHandler) {}

  /** Parses and returns a list of records from a raw TOS wsjson websocket response using json-patch */
  parseResponse(message: WsJsonRawMessage): ParsedPayloadResponse[] {
    // Defensive: only genuine payload responses are forwarded; malformed
    // frames (missing/empty payload) yield an empty list.
    if (isPayloadResponse(message)) {
      return this.genericHandler.parseResponse(message);
    } else {
      return [];
    }
  }

  /**
   * P4 透传：删除某 service+id 的补丁基底条目（见
   * GenericIncomingMessageHandler.removeStore）。客户端持有的是
   * ResponseParser（可能是注入实例），回收必须经由实际解析用的 handler。
   */
  removeStore(service: string, id: string): number {
    return this.genericHandler.removeStore(service, id);
  }

  /** P4 透传：清空全部补丁基底条目（显式 disconnect 时的全量回收）。 */
  clearStores(): void {
    this.genericHandler.clearStores();
  }
}
