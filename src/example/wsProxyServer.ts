import { WsJsonServer } from "../server/wsJsonServer.js";
import { RealWsJsonClient } from "../client/realWsJsonClient.js";
import { createServer } from "http";

// S1（task-15）：设置 TOS_PROXY_TOKEN 后，每条代理消息必须携带该 token
// （WsJsonClientProxy 配 authToken 自动附带）；不设置保持旧行为（无鉴权，
// 信任本机连接）。生产/多用户机器建议设置。
const authToken = process.env.TOS_PROXY_TOKEN;
const proxy = new WsJsonServer(
  () => new RealWsJsonClient(),
  createServer(),
  undefined,
  authToken ? { authToken } : undefined,
);
proxy.start();
