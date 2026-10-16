import { RouterSubscription } from "./responseRouter.js";

/**
 * 流式订阅的门面对象：持有一条 **专属** 订阅队列（`router.subscribe` 产出，
 * 见 responseRouter.ts——匹配帧按 service+id 投递，绝不与别的请求共享队列），
 * 在消费者提前退出（`for await` 的 break / 循环体异常触发协议调用
 * return()/throw()）时回调 onEnd，让客户端回收该订阅的资源：
 * - GenericIncomingMessageHandler.dataStore 补丁基底条目（removeStore）
 * - activeRequests 重放登记（防止重连后重放无人认领的订阅）
 * - best-effort 向服务端发 unsubscribe（见 RealWsJsonClient）
 *
 * 语义注意：
 * - 服务端正常终止流（router.endAll）不会触发 return()——该路径由客户端的
 *   endBuffer() 统一收尾；这里只覆盖消费者侧提前退出。
 * - 同一订阅上的多个消费者（promise() 与 for-await 并发）共享同一队列：
 *   router 对"同时在等的取数者"广播同一帧（与旧 MulticastIterator 的
 *   pendingItem 语义一致），error 帧因此能让所有等待者一起终止。
 * - 订阅在 dispatch 时 **立即** 建立（先于 sendMessage），响应帧先到也不会
 *   丢——旧实现靠全局缓冲兜住这个时序，新实现靠提前订阅。
 */
export default class SubscriptionStream<T> implements AsyncIterable<T> {
  private ended = false;

  constructor(
    private readonly sub: RouterSubscription,
    private readonly onEnd: () => void,
  ) {}

  /** 资源回收只执行一次（return/throw/重复 return 均幂等） */
  private end(): void {
    if (this.ended) return;
    this.ended = true;
    this.onEnd();
  }

  next(): Promise<IteratorResult<T>> {
    return this.sub.next() as Promise<IteratorResult<T>>;
  }

  /** `for await` 提前 break 时协议调用 */
  async return(_value?: unknown): Promise<IteratorResult<T>> {
    this.end();
    this.sub.close();
    return { done: true, value: undefined };
  }

  /** 消费者向循环 iterator 抛入异常（throw）时调用 */
  async throw(err?: unknown): Promise<IteratorResult<T>> {
    this.end();
    this.sub.close();
    throw err;
  }

  [Symbol.asyncIterator](): this {
    return this;
  }

  /** 兼容旧调用点：返回自身（同一订阅句柄，共享迭代器与回收语义） */
  iterable(): AsyncIterable<T> {
    return this;
  }

  iterator(): AsyncIterator<T> {
    return this;
  }

  /** 取该订阅的首个响应帧（与 iterable 消费者共享同一队列，互不丢帧） */
  async promise(): Promise<T> {
    const r = await this.sub.next();
    if (r.done) {
      throw new Error("Subscription stream ended before a response");
    }
    return r.value as T;
  }
}
