/**
 * 交易安全闸门。
 *
 * 把此前只存在于 scripts/probe-write.mjs 工具层的 paper-only 闸门移入库内：RealWsJsonClientOptions
 * .guard 配置，confirmOrder/submitOrder/replaceOrder/cancelOrder 四个写
 * 入口前置校验，任一规则不通过抛 GuardError——**默认 undefined = 不启用**，
 * 对既有调用方零行为变化。
 *
 * 校验顺序（从"会话级"到"订单级"，先粗后细）：
 *   1. paperOnly：会话 wsUrl 不含 "papermoney-services" 即拒绝一切写单
 *      （DEFAULT_WS_URL=真实盘，PAPER_WS_URL=模拟盘）；
 *   2. allowedAccountCodes：draft.accountNumber 必须在白名单内；
 *   3. maxQuantity：|quantity| 上限（quantity 正负=买/卖，同
 *      placeOrderMessageHandler 契约）；
 *   4. maxNotionalUsd：|quantity| × limitPrice 名义金额上限。
 *      MARKET 单（无 limitPrice）名义金额不可知——设了 maxNotionalUsd
 *      时保守拒绝（宁拦截不放过；可用 LIMIT 单表达，或不开该规则）。
 *
 * cancelOrder(orderId) 无账户/金额上下文：受 paperOnly 约束，账户白名单
 * 与限额规则不适用（撤单本身是风险削减动作）。
 */

export type GuardOptions = {
  /** true 时仅允许模拟盘会话（wsUrl 含 "papermoney-services"）写单 */
  paperOnly?: boolean;
  /** 允许写单的账户代码白名单；空数组 = 全部拒绝 */
  allowedAccountCodes?: string[];
  /** |quantity| 上限（超限拒绝；undefined 不校验） */
  maxQuantity?: number;
  /** |quantity|×limitPrice 名义金额（USD）上限（undefined 不校验） */
  maxNotionalUsd?: number;
};

/** 闸门拒绝写单时抛出的错误（区别于 WebSocketApiError/TransportError）。 */
export class GuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardError";
  }
}

/** 写单入口传入闸门的订单视图（PlaceOrderRequestParams 的可校验子集）。 */
export type GuardOrderCheck = {
  symbol: string;
  accountNumber: string;
  quantity: number;
  limitPrice?: number;
};

export class OrderGuard {
  constructor(
    private readonly options: GuardOptions,
    /** 会话是否模拟盘端点（RealWsJsonClient 构造期由 wsUrl 推导） */
    private readonly paperSession: boolean,
  ) {}

  /**
   * 写单（confirm/submit/replace）入口校验。op 为门面方法名，仅用于报错
   * 上下文。规则不通过即抛 GuardError，调用方（含 promise 链）拿到的是
   * 已 reject 的 Promise。
   */
  validateOrder(op: string, order: GuardOrderCheck): void {
    this.assertPaperSession(op);
    const { allowedAccountCodes, maxQuantity, maxNotionalUsd } = this.options;
    if (
      allowedAccountCodes !== undefined &&
      !allowedAccountCodes.includes(order.accountNumber)
    ) {
      throw new GuardError(
        `${op}: account "${order.accountNumber}" is not in guard.allowedAccountCodes`,
      );
    }
    const absQty = Math.abs(order.quantity);
    if (maxQuantity !== undefined && absQty > maxQuantity) {
      throw new GuardError(
        `${op}: quantity ${order.quantity} exceeds guard.maxQuantity ${maxQuantity}`,
      );
    }
    if (maxNotionalUsd !== undefined) {
      if (order.limitPrice === undefined) {
        throw new GuardError(
          `${op}: order for ${order.symbol} has no limitPrice, notional is unknowable and guard.maxNotionalUsd is set (market orders are rejected; use a LIMIT price or drop the rule)`,
        );
      }
      const notional = absQty * order.limitPrice;
      if (notional > maxNotionalUsd) {
        throw new GuardError(
          `${op}: notional ${notional} USD exceeds guard.maxNotionalUsd ${maxNotionalUsd}`,
        );
      }
    }
  }

  /** 撤单入口：仅会话级 paperOnly 约束。 */
  validateCancel(op: string): void {
    this.assertPaperSession(op);
  }

  private assertPaperSession(op: string): void {
    if (this.options.paperOnly && !this.paperSession) {
      throw new GuardError(
        `${op}: guard.paperOnly is enabled but this is not a paper-money session (wsUrl must contain "papermoney-services")`,
      );
    }
  }
}
