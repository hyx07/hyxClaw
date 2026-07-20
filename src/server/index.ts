import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { loadConfig, type Config } from "../config/index.js";
import { getPaths } from "../config/paths.js";
import { getLogger } from "../logger/index.js";
import { initTools } from "../tools/index.js";
import { createHttpHandler } from "./http.js";
import type { Client, ClientMessage, ServerMessage } from "./protocol.js";
import { sendToClient } from "./send.js";
import { handleWebSocketConnection } from "./websocket.js";

export type { Client, ClientMessage, ServerMessage } from "./protocol.js";
export type { CommandDefinition } from "./services/commands.js";
export { parseCommandsMarkdown } from "./services/commands.js";
export { buildAugmentedUserContent, buildPreviewContextSuffix } from "./services/chat-content.js";

export type ServerState = {
  port: number;
  host: string;
  clients: Map<WebSocket, Client>;
  httpServer: ReturnType<typeof createServer>;
  wss: WebSocketServer;
  config: Config;
};

export async function startServer(overrides?: { port?: number; host?: string; config?: Config }): Promise<ServerState> {
  const config = overrides?.config ?? await loadConfig();
  const logger = getLogger(getPaths().logs);
  const host = overrides?.host ?? config.server.host;
  const port = overrides?.port ?? config.server.port;
  initTools(config);

  const httpServer = createServer();
  const wss = new WebSocketServer({ server: httpServer });
  const clients = new Map<WebSocket, Client>();
  const broadcast = (message: ServerMessage): void => {
    for (const client of clients.values()) sendToClient(client, message);
  };

  wss.on("connection", (ws) => handleWebSocketConnection(ws, clients, config, logger));
  const healthCheckInterval = setInterval(() => {
    for (const [ws, client] of clients.entries()) {
      if (!client.isAlive) {
        ws.terminate();
        clients.delete(ws);
        continue;
      }
      client.isAlive = false;
      ws.ping();
    }
  }, 30_000);
  httpServer.on("close", () => clearInterval(healthCheckInterval));
  httpServer.on("request", createHttpHandler({ host, port, config, logger, broadcast }));

  await new Promise<void>((resolve, reject) => {
    httpServer.listen(port, host, resolve);
    httpServer.on("error", reject);
  });
  logger.info(`Server started on http://${host}:${port}`);
  logger.info(`WebSocket server ready at ws://${host}:${port}`);
  return { port, host, clients, httpServer, wss, config };
}

export async function stopServer(state: ServerState): Promise<void> {
  const { clients, httpServer, wss } = state;
  const logger = getLogger(getPaths().logs);
  for (const ws of clients.keys()) ws.close();
  clients.clear();
  wss.close();

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 3000);
    httpServer.close(() => {
      clearTimeout(timer);
      resolve();
    });
    httpServer.closeAllConnections?.();
  });
  logger.info("Server stopped");
}
