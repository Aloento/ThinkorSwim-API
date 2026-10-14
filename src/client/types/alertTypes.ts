export type AlertStatus = "ACTIVE" | "CANCELED" | "TRIGGERED";

export type PriceAlert = {
  id: number;
  symbol: string;
  triggerPrice: number;
  description?: string;
  status?: AlertStatus;
};

export type CreateAlertResponse = {
  alerts: PriceAlert[];
  service: "alerts/create";
};

export type LookupAlertsResponse = {
  alerts: PriceAlert[];
  service: "alerts/lookup";
};

export type AlertSubscribeResponse = {
  alerts: PriceAlert[];
  service: "alerts/subscribe";
};

export type CancelAlertResponse = {
  alerts: PriceAlert[];
  service: "alerts/cancel";
};

export type RawAlertResponse = {
  id: number;
  version: number;
  user: { id: string; domain: string };
  time: number;
  closeTime: number;
  activationTime: number;
  expirationRemindTime: number;
  expirationTime: number;
  lastTriggeredTime: number;
  status: AlertStatus;
  // 实测两帧均含 tag: "TDA"（线上实测）
  tag: string;
  market: {
    field: string;
    operator: string;
    exchange: string;
    threshold: number;
    // 实测请求只需 {symbol, quantity}；服务端回填 cusip/sus/assetType，
    // 故除 symbol/quantity 外均为可选。
    components: {
      symbol: string;
      quantity: number;
      cusip?: string;
      sus?: string;
      assetType?: string;
    }[];
    type: string;
  };
  lastNotificationTime: number;
};

export type AlertResponseType =
  | "AlertsSubscriptionConfirmationResponse"
  | "ChangedAlertResponse"
  | "TriggeredAlertResponse";

export type RawAlertSubscribeResponse = {
  type: AlertResponseType;
  result?: string;
  changedAlert?: RawAlertResponse;
  alert?: RawAlertResponse;
  alertDescription?: string;
};

export type RawAlertCancelResponse = {
  alertId: number;
  result: string;
};
