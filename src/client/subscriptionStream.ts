import { Observable } from "obgen";

/**
 * 流式订阅的门面对象：包装 dispatch 得到的 Observable，
 * 在消费者提前退出（`for await` 的 break / 循环体异常触发协议调用
 * return()/throw()）时回调 onEnd，让客户端回收该订阅的资源：
 * - GenericIncomingMessageHandler.dataStore 补丁基底条目（removeStore）
 * - activeRequests 重放登记（防止重连后重放无人认领的订阅）
 * - best-effort 向服务端发 unsubscribe（见 RealWsJsonClient）
 *
 * 语义注意：服务端正常终止流（buffer.end）不会触发 return()——该路径
 * 由客户端的 terminateStreams() 统一收尾；这里只覆盖消费者侧提前退出。
 *
 * 兼容层：保留 `.iterable()` / `.promise()` / `.iterator()` 门面方法，
 * 使既有 `dispatch(...).iterable()` / `.promise()` 调用点无需改动。
 */
export default class SubscriptionStream<T> implements AsyncIterable<T> {
  private activeIterator?: AsyncIterator<T>;
  private ended = false;

  constructor(
    private readonly observable: Observable<T>,
    private readonly onEnd: () => void,
  ) {}

  private ensure(): AsyncIterator<T> {
    if (!this.activeIterator) {
      this.activeIterator = this.observable.iterable()[Symbol.asyncIterator]();
    }
    return this.activeIterator;
  }

  /** 资源回收只执行一次（return/throw/重复 return 均幂等） */
  private end(): void {
    if (this.ended) return;
    this.ended = true;
    this.onEnd();
  }

  next(): Promise<IteratorResult<T>> {
    return this.ensure().next();
  }

  /** `for await` 提前 break 时协议调用 */
  async return(value?: unknown): Promise<IteratorResult<T>> {
    this.end();
    const it = this.activeIterator;
    this.activeIterator = undefined;
    return (await it?.return?.(value)) ?? { done: true, value: undefined };
  }

  /** 消费者向循环 iterator 抛入异常（throw）时调用 */
  async throw(err?: unknown): Promise<IteratorResult<T>> {
    this.end();
    const it = this.activeIterator;
    this.activeIterator = undefined;
    if (it?.throw) return await it.throw(err);
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
    return this.ensure();
  }

  promise(): Promise<T> {
    return this.observable.promise();
  }
}
