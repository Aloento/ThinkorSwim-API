import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import { OrderEvent } from "./orderEventsMessageHandler.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// wire 上 orderType 枚举为
// [CANCEL, MARKET, LIMIT, STOP, STOPLIMIT, TRAILSTOP, TRAILSTOPLIMIT,
// WALK_LIMIT, MOC, LOC, EXERCISE, AMOUNT, CONVERSION, ROLL_OPEN,
// ROLL_CLOSE, CLOSE, DIRECT_DEAL, RAQ, NET_DEBIT, NET_CREDIT]。
// 止损限价在 wire 上是 STOPLIMIT（无下划线）；STOP_LIMIT 报
// Mismatched request parameter name。门面 API 保留可读的 "STOP_LIMIT"，
// buildRequest 按 WIRE_ORDER_TYPE 映射为 wire 值。
export type OrderType = "LIMIT" | "MARKET" | "STOP" | "STOP_LIMIT";

const WIRE_ORDER_TYPE: Record<OrderType, string> = {
  LIMIT: "LIMIT",
  MARKET: "MARKET",
  STOP: "STOP",
  STOP_LIMIT: "STOPLIMIT",
};

// 有效期限（tif）枚举：["DAY","GTC","EXT","GTC_EXT","AM","PM"]，
// 取自 CONFIRM snapshot 的 orders[].tifs.values。WEEK/EXTENDED 不存在于该枚举。
export type OrderTif = "DAY" | "GTC" | "EXT" | "GTC_EXT" | "AM" | "PM";

type PlaceOrderBaseParams = {
  accountNumber: string;
  // 股票直接用符号（"AAPL"）；期权腿直接传期权合约代码
  // （wire 形如 ".AAPL261014C245"，option_chain/get 的 callSymbol/putSymbol
  // 即此格式；TOS 显示式 AAPL251219C00300000 为该合约的另一种写法）。
  symbol: string;
  // quantity > 0 => buy; quantity < 0 => sell
  quantity: number;
  refOrderId?: number;
  // 缺省 LIMIT
  orderType?: OrderType;
  // CONFIRM 不传则不发该键；SUBMIT 缺省 "DAY"
  tif?: OrderTif;
};

// 判别联合：MARKET 无 limitPrice/stopPrice；STOP 仅 stopPrice；
// STOP_LIMIT 两者皆有；LIMIT 仅 limitPrice。服务端对未知/不适用参数整条报错。
export type PlaceOrderRequestParams =
  | (PlaceOrderBaseParams & {
      orderType?: "LIMIT";
      limitPrice: number;
      stopPrice?: never;
    })
  | (PlaceOrderBaseParams & {
      orderType: "MARKET";
      limitPrice?: never;
      stopPrice?: never;
    })
  | (PlaceOrderBaseParams & {
      orderType: "STOP";
      limitPrice?: never;
      stopPrice: number;
    })
  | (PlaceOrderBaseParams & {
      orderType: "STOP_LIMIT";
      limitPrice: number;
      stopPrice: number;
    });

/** 兼容别名：旧名沿用（LIMIT 语义即联合的默认分支） */
export type PlaceLimitOrderRequestParams = PlaceOrderRequestParams;

/**
 * place_order orders[0] 条目构造（CONFIRM ver:1 与 SUBMIT ver:0 共用）。
 * 按 orderType 条件输出 limitPrice/stopPrice；tif 显式传入才发
 * （SUBMIT 传 defaultTif="DAY"）。
 */
export function buildPlaceOrderEntry(
  params: PlaceOrderRequestParams,
  requestType: "INIT_STOCK" | "EDIT_ORDER",
  options?: { defaultTif?: OrderTif; tag?: string },
): Record<string, unknown> {
  const {
    symbol,
    quantity,
    orderType = "LIMIT",
    tif,
    limitPrice,
    stopPrice,
    refOrderId,
  } = params;
  const effectiveTif = tif ?? options?.defaultTif;
  return {
    requestType,
    ...(requestType === "EDIT_ORDER" && refOrderId !== undefined
      ? { refOrderId }
      : {}),
    orderType: WIRE_ORDER_TYPE[orderType],
    ...(effectiveTif !== undefined ? { tif: effectiveTif } : {}),
    ...(limitPrice !== undefined ? { limitPrice } : {}),
    ...(stopPrice !== undefined ? { stopPrice } : {}),
    legs: [{ symbol, quantity }],
    ...(options?.tag !== undefined ? { tag: options.tag } : {}),
  };
}

export type RawPlaceOrderPatchResponse = {
  patches: {
    op: string;
    path: string;
    value: any;
  }[];
};

export type RawPlaceOrderSnapshotResponse = {
  groupType: string;
  confirmation: {
    commission: number;
    cost: number;
    fee: number;
    rows: {
      title: string;
      value: string;
    }[];
  };
  maxOrders: number;
  orders: RawPlaceOrderItem[];
};

type RawPlaceOrderItem = {
  orderId: number;
  types: { values: string[]; selection: number };
  exchanges: { values: string[]; selection: number };
  tifs: { values: string[]; selection: number };
  legsDescription: string;
  actionDescription: string;
  orderLegsDescription: string;
  orderLegsDescDisplay: string;
  dollarValue: number;
  quantity: number;
  legs: [{ symbol: string }];
  priceLocked: boolean;
  limitPrice: number;
  midPrice: number;
  natPrice: number;
  bidPrice: number;
  askPrice: number;
  priceStep: number;
  priceFractionalType: string;
  underlyingSymbol: string;
  spreadName: string;
  descriptionToShare: string;
  futureSpread: boolean;
  confirmation: string;
  minQty: number;
  maxQty: number;
  priceType: string;
  compositeSymbol: string;
  compositeDisplaySymbol: string;
  quantityOffset: number;
  quantityStep: number;
  limitOffsetStep: number;
  stopOffsetStep: number;
  quantityLinkOptions: string[];
  descriptionTemplate: string;
};

export type PlaceOrderSnapshotResponse = {
  orders: OrderEvent[];
  service: "place_order";
};

export default class PlaceOrderMessageHandler implements WebSocketApiMessageHandler<PlaceOrderRequestParams> {
  // 下单第一步 CONFIRM：quantity > 0 => buy，quantity < 0 => sell
  buildRequest(params: PlaceOrderRequestParams): RawPayloadRequest {
    const { symbol } = params;
    return newPayload({
      header: {
        id: `update-draft-order-${symbol}`,
        service: "place_order",
        ver: 1,
      },
      params: {
        accountCode: params.accountNumber,
        action: "CONFIRM",
        marker: "SINGLE",
        orders: [buildPlaceOrderEntry(params, "INIT_STOCK")],
      },
    });
  }

  service: ApiService = "place_order";
}
