import debug from "debug";
import { isResponseForRequest } from "./messageTypeHelpers.js";
import { ParsedPayloadResponse } from "./tdaWsJsonTypes.js";

const logger = debug("responseRouter");

/**
 * 响应帧的一对多路由（fan-out）：单泵 + 每订阅者私有 FIFO 队列。
 *
 * onMessage 解析出的每帧调用一次 `dispatch`，按 service+id 匹配；匹配的每个
 * 订阅者各入队一份，不匹配的帧谁都不入。帧永不从他人队列中取走——共享拉取
 * 队列 + filter 丢弃会让不相关等待者吞掉别人的帧，导致后续请求永久挂起。
 *
 * 内存：队列只收本 service+id 的帧；一次性请求 settle、流式订阅提前退出、
 * 会话终结时必须 `close()`。积压超阈值只告警不丢帧（丢帧不可恢复）。
 */
const QUEUE_WARN_THRESHOLD = 10_000;

type Subscriber = {
  service?: string;
  id?: string;
  /** 已解析、未被消费的帧（FIFO） */
  queue: ParsedPayloadResponse[];
  /** 等待新帧的取数者；dispatch 时同一帧广播给全部等待者 */
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
   * 登记一个订阅。匹配规则见 `isResponseForRequest`：service 必须相同；
   * 双方都有 id 时 id 必须相同（防同服务并发请求串线）；响应不带 id 时按
   * service 名单侧匹配。
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

  /** 把一帧投给所有匹配的订阅者（各队列共享同一对象引用）。 */
  dispatch(msg: ParsedPayloadResponse): void {
    if (this.subscribers.size === 0) return;
    for (const sub of [...this.subscribers]) {
      if (sub.closed || !isResponseForRequest(msg, sub.service, sub.id))
        continue;
      if (sub.pending.length > 0) {
        // 同一帧广播给该订阅上所有等待者：并发 next() 的消费者收到同一帧，
        // error 帧因此能让 promise() 与 for-await 一起终止。
        const waiters = sub.pending.splice(0, sub.pending.length);
        for (const resolve of waiters) resolve({ value: msg, done: false });
      } else {
        // 无等待者：入队，留给下一个 next()（帧先于消费者到达）
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
   * 结束并清空全部订阅（会话终结入口）：挂着的取数者以 done 结算。
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
