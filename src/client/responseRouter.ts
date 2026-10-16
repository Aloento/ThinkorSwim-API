import debug from "debug";
import { isResponseForRequest } from "./messageTypeHelpers.js";
import { ParsedPayloadResponse } from "./tdaWsJsonTypes.js";

const logger = debug("responseRouter");

/**
 * 响应帧的**一对多路由**（fan-out）。
 *
 * 为什么需要它（2026-10-16 挂死事故根因，Schwab-DCA run 38878151523）：
 * 旧实现是 `deferredWrap(() => this.iterator).filter(isResponseForRequest)`，
 * 其中 `this.iterator = new MulticastIterator(buffer)`，而 buffer 是**单个**
 * `BufferedIterator`——它是**队列**（`next()` 会 shift 消费掉），不是可重放的
 * 源。于是每个等待者从同一条队列拉走且只拉走一帧，`filter` 把"不是我要的"
 * 那帧**直接丢弃**：
 *
 *   - 一帧只要被"不相关的等待者"先拉走，真正的收件人就再也拿不到它；
 *   - `filterIterator.next()` 丢弃后立即再拉一帧，这个错误等待者于是成为
 *     **永久的帧黑洞**，吞掉后续每一帧 → 之后每个请求都挂死（探针表现：
 *     第一轮全部正常，第二轮起第一个网络 await 永久挂起）。
 *
 * `MulticastIterator` 的"多播"只覆盖**同一时刻**并发 `next()` 的调用者
 * （共享一个 pendingItem），跨请求的帧仍然是一次性的，救不了这个模型。
 *
 * 现在的模型：**单一泵**（onMessage 解析出的每一帧调一次 `dispatch`）+
 * **每个订阅者自己的 FIFO 队列**。匹配规则与旧 filter 完全同源（复用
 * `isResponseForRequest`），差别只有一处、也正是修复本身：匹配的所有队列
 * 各自入队一份；不匹配的帧不丢给任何队列，但**绝不从别人的队列里抢**。
 *
 * 内存：队列只收"自己 service+id"的帧，增长上界 = 该逻辑文档的流量；
 * 一次性请求 settle、流式订阅提前退出、会话终结时必须 `close()`。
 * 积压超阈值只告警、不丢帧（静默丢帧正是本次事故的病根，绝不重犯）。
 */
const QUEUE_WARN_THRESHOLD = 10_000;

type Subscriber = {
  service?: string;
  id?: string;
  /** 已解析、未被消费的帧（FIFO） */
  queue: ParsedPayloadResponse[];
  /** 等待新帧的取数者（LIFO，与 BufferedIterator 行为一致） */
  pending: Array<(r: IteratorResult<ParsedPayloadResponse>) => void>;
  closed: boolean;
  warned: boolean;
};

/** 与 AsyncIterableIterator 兼容 + close()。 */
export interface RouterSubscription extends AsyncIterableIterator<ParsedPayloadResponse> {
  /** 注销订阅（幂等），并释放仍在等待的取数者（done）。 */
  close(): void;
}

export default class ResponseRouter {
  private readonly subscribers = new Set<Subscriber>();

  /**
   * 登记一个订阅。匹配语义沿用 `isResponseForRequest(msg, service, id)`：
   * 服务名必须相同；双方都有 id 时 id 必须相同（防同服务并发请求串线）；
   * 响应不带 id（宽松服务端）按服务名单侧匹配——与旧 filter 逐字节一致。
   */
  subscribe(service?: string, id?: string): RouterSubscription {
    const sub: Subscriber = {
      service,
      id,
      queue: [],
      pending: [],
      closed: false,
      warned: false,
    };
    this.subscribers.add(sub);
    logger("subscribe %s$%s (total=%d)", service, id, this.subscribers.size);
    return makeSubscription(this, sub);
  }

  /** 把一帧投给所有匹配的订阅者（同一对象引用，与旧共享模型一致）。 */
  dispatch(msg: ParsedPayloadResponse): void {
    if (this.subscribers.size === 0) return;
    for (const sub of [...this.subscribers]) {
      if (sub.closed || !isResponseForRequest(msg, sub.service, sub.id))
        continue;
      if (sub.pending.length > 0) {
        // 广播给该订阅上**所有**正在等待的取数者（同一帧），复刻旧
        // MulticastIterator 的 pendingItem join 语义——一次并发 next() 的
        // 多个消费者收到同一帧。error 帧因此能让同一订阅的所有消费者
        // （promise() 与 for-await 并发）一起终止。
        const waiters = sub.pending.splice(0, sub.pending.length);
        for (const resolve of waiters) resolve({ value: msg, done: false });
      } else {
        // 无等待者：入队留给下一个 next()（帧先于消费者到达的场景）
        sub.queue.push(msg);
        if (!sub.warned && sub.queue.length > QUEUE_WARN_THRESHOLD) {
          sub.warned = true;
          console.warn(
            `⚠️ Response queue for ${msg.service}$${msg.id} exceeds ` +
              `${QUEUE_WARN_THRESHOLD} unconsumed frames — a subscriber is ` +
              `not reading it (leaked subscription?). Frames still delivered.`,
          );
        }
      }
    }
  }

  /**
   * 结束并清空全部订阅（会话终结 / 重建流的入口）。释放所有仍挂着的取数者
   * （done），不给"永远等不到的 promise"留活口。
   */
  endAll(): void {
    const subs = [...this.subscribers];
    this.subscribers.clear();
    for (const sub of subs) closeSubscriber(sub);
    if (subs.length) logger("endAll: closed %d subscriber(s)", subs.length);
  }

  /** @internal 测试钩子：当前活跃订阅数 */
  size(): number {
    return this.subscribers.size;
  }

  /** @internal 供 Subscription 取数（LIFO：队列优先，否则挂起等待） */
  nextFor(sub: Subscriber): Promise<IteratorResult<ParsedPayloadResponse>> {
    if (sub.queue.length > 0)
      return Promise.resolve({ value: sub.queue.shift()!, done: false });
    if (sub.closed) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve) => {
      sub.pending.push(resolve);
    });
  }

  /** @internal 供 Subscription.close() */
  closeFor(sub: Subscriber): void {
    if (this.subscribers.delete(sub)) {
      logger(
        "close %s$%s (total=%d)",
        sub.service,
        sub.id,
        this.subscribers.size,
      );
    }
    closeSubscriber(sub);
  }
}

function closeSubscriber(sub: Subscriber): void {
  if (sub.closed) return;
  sub.closed = true;
  sub.queue = [];
  const waiters = sub.pending.splice(0, sub.pending.length);
  for (const resolve of waiters) resolve({ value: undefined, done: true });
}

function makeSubscription(
  router: ResponseRouter,
  sub: Subscriber,
): RouterSubscription {
  return {
    next: () => router.nextFor(sub),
    return: () => {
      router.closeFor(sub);
      return Promise.resolve({ value: undefined, done: true });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
    close: () => router.closeFor(sub),
  };
}
