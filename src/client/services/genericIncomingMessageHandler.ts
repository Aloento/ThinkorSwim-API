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

  /**
   * 基底按 **service+id** 命中，与 ver 无关。
   *
   * 同一 service+id 是同一逻辑文档的演进，ver 只是文档版本号：place_order
   * 草稿 snapshot 是 ver:1，SUBMIT 完成 patch 是 **ver:0 同 id**。按
   * `service_id_ver` 查基底会让跨 ver patch 找不到基底，fast-json-patch 在
   * `{}` 上应用（remove 不存在的 path 抛错，即使 validateOperation:false），
   * 整条 patch 被丢弃、orderId 丢失。
   *
   * 不变量：每个 service+id 在 dataStore 中至多一条基底，键后缀 = 最后一次
   * snapshot 的 ver（仅诊断用）；patch 合并写回基底键，不新增条目。基底键与
   * removeStore 用同一前缀规则（`service_id_`）。
   */
  private docPrefix(service: string, id: string): string {
    return `${service}_${id}_`;
  }

  /** 找到 service+id 的当前基底键（跨 ver）；无基底时 undefined。 */
  private findBaseKey(service: string, id: string): string | undefined {
    const prefix = this.docPrefix(service, id);
    for (const key of Object.keys(this.dataStore)) {
      if (key.startsWith(prefix)) return key;
    }
    return undefined;
  }

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
          // snapshot 是该逻辑文档的新基底：先清掉同 service+id 的其他条目，
          // 避免同文档多基底（残留旧条目会让后续 patch 命中哪条取决于遍历顺序）。
          this.removeStore(service, id);
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

  /**
   * 删除 dataStore 中某 service+id 的全部补丁基底条目
   * （所有 ver）。dataStore 按 `service_id_ver` 只进不出，长连接下（尤其
   * quotes/chart 高频 patch）会无限增长——客户端在订阅生命周期结束
   * （iterable 消费者提前退出 / disconnect）时调用本方法回收。
   * 返回实际删除的条目数（幂等：无匹配时为 0）。
   */
  removeStore(service: string, id: string): number {
    const prefix = `${service}_${id}_`;
    let removed = 0;
    for (const key of Object.keys(this.dataStore)) {
      if (key.startsWith(prefix)) {
        delete this.dataStore[key];
        removed++;
      }
    }
    return removed;
  }

  /** 清空全部补丁基底条目（显式 disconnect 时的全量回收）。 */
  clearStores(): void {
    for (const key of Object.keys(this.dataStore)) {
      delete this.dataStore[key];
    }
  }

  /** @internal 测试钩子：dataStore 当前条目数（不在公开门面上暴露）。 */
  storeSize(): number {
    return Object.keys(this.dataStore).length;
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
    // 跨 ver 命中基底（见 docPrefix 注释）。合并结果写回**基底键**
    // （而非 patch 自身的 ver 键），维持「每文档一条基底」不变量。
    const baseKey = this.findBaseKey(service, id) ?? storeKey;
    const existingObject = this.dataStore[baseKey];
    if (!existingObject) {
      // Patch received before (or without) its snapshot base: warn loudly with
      // diagnostics instead of silently corrupting state, then continue.
      console.warn(
        `⚠️ Received patch for ${baseKey} without a snapshot base; ` +
          `applying ${patches.length} patch(es) to an empty document. ` +
          `The resulting body may be incomplete.`,
      );
      logger("patch without base: key=%s patches=%O", baseKey, patches);
    }
    try {
      const { newDocument } = applyPatch(
        existingObject ?? {},
        patches,
        /* validateOperation */ false,
      );
      this.dataStore[baseKey] = newDocument;
      return [{ service, id, body: newDocument ?? {} }];
    } catch (e) {
      console.warn(
        `⚠️ Failed to apply patch for ${baseKey}, skipping entry: `,
        e,
      );
      return [];
    }
  }
}
