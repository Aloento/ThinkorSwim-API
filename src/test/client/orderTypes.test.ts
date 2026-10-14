import PlaceOrderMessageHandler, {
  PlaceOrderRequestParams,
} from "../../client/services/placeOrderMessageHandler";
import SubmitOrderMessageHandler, {
  ReplaceOrderRequestParams,
} from "../../client/services/submitOrderMessageHandler";

const base = {
  accountNumber: "D-12345678", // 测试占位（非真实账户）
  symbol: "AAPL",
  quantity: 1,
};

const entryOf = (
  request: ReturnType<PlaceOrderMessageHandler["buildRequest"]>,
) => request.payload[0].params!.orders[0] as Record<string, unknown>;

describe("order type extension", () => {
  describe("compile cases——判别联合按 orderType 约束价格字段", () => {
    it("LIMIT（默认）：limitPrice 必填、无 stopPrice", () => {
      const limit: PlaceOrderRequestParams = { ...base, limitPrice: 1 };
      const explicit: PlaceOrderRequestParams = {
        ...base,
        orderType: "LIMIT",
        limitPrice: 1,
      };
      expect(limit).toBeTruthy();
      expect(explicit).toBeTruthy();
      // 编译期反例（保持注释以固化用例意图，解开应报错）：
      // const noPrice: PlaceOrderRequestParams = { ...base };
      // const marketWithPrice: PlaceOrderRequestParams = {
      //   ...base, orderType: "MARKET", limitPrice: 1,
      // };
      // const stopWithLimit: PlaceOrderRequestParams = {
      //   ...base, orderType: "STOP", stopPrice: 1, limitPrice: 1,
      // };
    });

    it("MARKET：无 limitPrice/stopPrice", () => {
      const market: PlaceOrderRequestParams = {
        ...base,
        orderType: "MARKET",
      };
      expect(market).toBeTruthy();
    });

    it("STOP：仅 stopPrice；STOP_LIMIT：两者皆有", () => {
      const stop: PlaceOrderRequestParams = {
        ...base,
        orderType: "STOP",
        stopPrice: 1,
      };
      const stopLimit: PlaceOrderRequestParams = {
        ...base,
        orderType: "STOP_LIMIT",
        stopPrice: 1,
        limitPrice: 2,
      };
      expect(stop).toBeTruthy();
      expect(stopLimit).toBeTruthy();
    });

    it("tif 枚举 + 期权腿 symbol（string 天然支持）", () => {
      const gtc: PlaceOrderRequestParams = {
        ...base,
        limitPrice: 1,
        tif: "GTC",
      };
      const optionLeg: PlaceOrderRequestParams = {
        ...base,
        symbol: ".AAPL261016C250",
        limitPrice: 0.01,
      };
      expect(gtc).toBeTruthy();
      expect(optionLeg).toBeTruthy();
    });
  });

  describe("buildRequest——只发该 orderType 必要的键", () => {
    const confirm = new PlaceOrderMessageHandler();
    const submit = new SubmitOrderMessageHandler();

    it("CONFIRM LIMIT（W1 形状回归）：无 tif/tag", () => {
      const req = confirm.buildRequest({ ...base, limitPrice: 1 });
      expect(req.payload[0].header).toEqual({
        id: "update-draft-order-AAPL",
        service: "place_order",
        ver: 1,
      });
      const entry = entryOf(req);
      expect(entry).toEqual({
        requestType: "INIT_STOCK",
        orderType: "LIMIT",
        limitPrice: 1,
        legs: [{ symbol: "AAPL", quantity: 1 }],
      });
      expect(entry).not.toHaveProperty("stopPrice");
      expect(entry).not.toHaveProperty("tif");
    });

    it("CONFIRM MARKET：不发 limitPrice/stopPrice", () => {
      const entry = entryOf(
        confirm.buildRequest({ ...base, orderType: "MARKET" }),
      );
      expect(entry.orderType).toBe("MARKET");
      expect(entry).not.toHaveProperty("limitPrice");
      expect(entry).not.toHaveProperty("stopPrice");
    });

    it("CONFIRM STOP：仅 stopPrice；STOP_LIMIT：stopPrice+limitPrice", () => {
      const stop = entryOf(
        confirm.buildRequest({ ...base, orderType: "STOP", stopPrice: 100 }),
      );
      expect(stop).toMatchObject({ orderType: "STOP", stopPrice: 100 });
      expect(stop).not.toHaveProperty("limitPrice");

      const stopLimit = entryOf(
        confirm.buildRequest({
          ...base,
          orderType: "STOP_LIMIT",
          stopPrice: 100,
          limitPrice: 101,
        }),
      );
      expect(stopLimit).toMatchObject({
        // W9b 实测：wire 值是 STOPLIMIT（无下划线），STOP_LIMIT 被拒
        orderType: "STOPLIMIT",
        stopPrice: 100,
        limitPrice: 101,
      });
    });

    it("CONFIRM 显式 tif 透传；SUBMIT 缺省 tif=DAY + tag=TOSWeb（W2 回归）", () => {
      const gtcExt = entryOf(
        confirm.buildRequest({ ...base, limitPrice: 1, tif: "GTC_EXT" }),
      );
      expect(gtcExt.tif).toBe("GTC_EXT");

      const submitEntry = entryOf(
        submit.buildRequest({ ...base, limitPrice: 1 }),
      );
      expect(submitEntry).toEqual({
        requestType: "INIT_STOCK",
        orderType: "LIMIT",
        tif: "DAY",
        limitPrice: 1,
        legs: [{ symbol: "AAPL", quantity: 1 }],
        tag: "TOSWeb",
      });
    });

    it("SUBMIT MARKET 保留 orderType（调用方自担成交风险）", () => {
      const entry = entryOf(
        submit.buildRequest({ ...base, orderType: "MARKET", tif: "GTC" }),
      );
      expect(entry).toMatchObject({
        orderType: "MARKET",
        tif: "GTC",
        tag: "TOSWeb",
      });
      expect(entry).not.toHaveProperty("limitPrice");
    });

    it("EDIT_ORDER + refOrderId（W3 回归），Required<联合> 可赋值", () => {
      const req = submit.buildRequest({
        ...base,
        limitPrice: 2,
        refOrderId: 5411072868,
      } as ReplaceOrderRequestParams);
      expect(req.payload[0].header.id).toBe("edit-order-AAPL");
      const entry = entryOf(req);
      expect(entry).toMatchObject({
        requestType: "EDIT_ORDER",
        refOrderId: 5411072868,
        orderType: "LIMIT",
        limitPrice: 2,
      });
    });

    it("期权腿：symbol 原样进 legs", () => {
      const entry = entryOf(
        confirm.buildRequest({
          ...base,
          symbol: ".AAPL261016C250",
          limitPrice: 0.01,
        }),
      );
      expect(entry.legs).toEqual([{ symbol: ".AAPL261016C250", quantity: 1 }]);
    });
  });
});
