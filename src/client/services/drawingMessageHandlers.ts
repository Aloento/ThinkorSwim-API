import { RawPayloadRequest } from "../tdaWsJsonTypes.js";
import { ApiService } from "./apiService.js";
import WebSocketApiMessageHandler, {
  newPayload,
} from "./webSocketApiMessageHandler.js";

// 图表画线服务全套（agent/06 第三轮：drawing/create、drawing/update、
// drawing/delete、drawing_set/create、drawing_set/delete）。
//
// 参数双证据：
// 1) 校验帧（drawing_create.jsonl / drawing_set_create.jsonl）：
//    drawing/create     "$.params.drawingSetGuid: must not be blank;
//                        $.params.drawing: must not be null"
//    drawing_set/create "$.params.symbol: must not be blank;
//                        $.params.name: must not be blank"
// 2) bundle 调用点（agent/artifacts/frontend-index.js，逐字核对）：
//    drawing/create  params:{drawingSetGuid, drawing}   id:"drawing/create"
//    drawing/update  params:{drawingSetGuid, drawingGuid, drawing}
//                                                     id:"drawing/update"
//    drawing/delete  params:{drawingGuid, drawingSetGuid} id:"drawing/delete"
//    drawing_set/create params:{symbol, name}          id:"drawing_set_create"
//    drawing_set/delete params:{guid, symbol}          id:"drawing_set_delete"
// bundle 响应 schema：drawing_set/create → {drawingSet:{guid,name,isDefault}}。
// drawing 本体的完整结构（trendline/curve/startTime...）guest 无法实测，
// 按 unknown 建模。

export type DrawingSetItem = {
  guid: string;
  name: string;
  isDefault?: boolean;
  [key: string]: unknown;
};

export type DrawingItem = {
  guid?: string | null;
  [key: string]: unknown;
};

export type DrawingCreateRequestParams = {
  drawingSetGuid: string;
  drawing: DrawingItem;
};

export type DrawingUpdateRequestParams = {
  drawingSetGuid: string;
  drawingGuid: string;
  drawing: DrawingItem;
};

export type DrawingDeleteRequestParams = {
  drawingSetGuid: string;
  drawingGuid: string;
};

export type DrawingSetCreateRequestParams = {
  symbol: string;
  name: string;
};

export type DrawingSetDeleteRequestParams = {
  guid: string;
  symbol: string;
};

export type RawPayloadResponseDrawingSetCreate = {
  drawingSet: DrawingSetItem;
};

export default class DrawingCreateMessageHandler implements WebSocketApiMessageHandler<DrawingCreateRequestParams> {
  buildRequest({
    drawingSetGuid,
    drawing,
  }: DrawingCreateRequestParams): RawPayloadRequest {
    return newPayload({
      header: { service: "drawing/create", id: "drawing/create", ver: 0 },
      params: { drawingSetGuid, drawing },
    });
  }

  service: ApiService = "drawing/create";
}

export class DrawingUpdateMessageHandler implements WebSocketApiMessageHandler<DrawingUpdateRequestParams> {
  buildRequest({
    drawingSetGuid,
    drawingGuid,
    drawing,
  }: DrawingUpdateRequestParams): RawPayloadRequest {
    return newPayload({
      header: { service: "drawing/update", id: "drawing/update", ver: 0 },
      params: { drawingSetGuid, drawingGuid, drawing },
    });
  }

  service: ApiService = "drawing/update";
}

export class DrawingDeleteMessageHandler implements WebSocketApiMessageHandler<DrawingDeleteRequestParams> {
  buildRequest({
    drawingSetGuid,
    drawingGuid,
  }: DrawingDeleteRequestParams): RawPayloadRequest {
    return newPayload({
      header: { service: "drawing/delete", id: "drawing/delete", ver: 0 },
      params: { drawingGuid, drawingSetGuid },
    });
  }

  service: ApiService = "drawing/delete";
}

export class DrawingSetCreateMessageHandler implements WebSocketApiMessageHandler<DrawingSetCreateRequestParams> {
  buildRequest({
    symbol,
    name,
  }: DrawingSetCreateRequestParams): RawPayloadRequest {
    return newPayload({
      header: {
        service: "drawing_set/create",
        id: "drawing_set_create",
        ver: 0,
      },
      params: { symbol, name },
    });
  }

  service: ApiService = "drawing_set/create";
}

export class DrawingSetDeleteMessageHandler implements WebSocketApiMessageHandler<DrawingSetDeleteRequestParams> {
  buildRequest({
    guid,
    symbol,
  }: DrawingSetDeleteRequestParams): RawPayloadRequest {
    return newPayload({
      header: {
        service: "drawing_set/delete",
        id: "drawing_set_delete",
        ver: 0,
      },
      params: { guid, symbol },
    });
  }

  service: ApiService = "drawing_set/delete";
}
