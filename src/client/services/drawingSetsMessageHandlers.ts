import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import { DrawingItem } from "./drawingMessageHandlers.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 画线读服务（drawing 写套的配套）。参数逐字抄自前端 bundle
// （agent/artifacts/frontend-index.js）调用点：
//   drawing_sets  id:`drawing_sets-<n>`  params:{symbol}
//   drawings      id:`drawings_<guid>`   params:{guid}
//                 响应 drawings[]（bundle 里逐条按 o.type 分支处理，
//                 如 Trendline 带 curve{color,...}、startTime/endTime）
// 线上帧未实测（guest 可读性未探测）。

export type DrawingSetsRequestParams = {
  symbol: string;
};

export type RawPayloadResponseDrawingSets = {
  drawingSets?: { guid: string; name: string; isDefault?: boolean }[];
  [key: string]: unknown;
};

export type DrawingsRequestParams = {
  // drawing_set 的 guid
  guid: string;
};

export type RawPayloadResponseDrawings = {
  drawings: DrawingItem[];
};

// 某 symbol 的画线集合目录。
export default class DrawingSetsMessageHandler implements WebSocketApiMessageHandler<DrawingSetsRequestParams> {
  buildRequest({ symbol }: DrawingSetsRequestParams): RawPayloadRequest {
    return newPayload({
      header: { service: "drawing_sets", id: "drawing_sets", ver: 0 },
      params: { symbol },
    });
  }

  service: ApiService = "drawing_sets";
}

export class DrawingsMessageHandler implements WebSocketApiMessageHandler<DrawingsRequestParams> {
  buildRequest({ guid }: DrawingsRequestParams): RawPayloadRequest {
    return newPayload({
      header: { service: "drawings", id: `drawings_${guid}`, ver: 0 },
      params: { guid },
    });
  }

  service: ApiService = "drawings";
}
