import { WebSocket, WebSocketServer } from "ws";
import { createLogger } from "../logger.js";
import type { TabletEvent, WorkstationConfig } from "../types.js";

interface TabletClientSocket extends WebSocket {
  isAlive: boolean;
}

const logger = createLogger("tablet-bridge");

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class TabletBridge {
  private server: WebSocketServer | null = null;
  private pingTimer: NodeJS.Timeout | null = null;

  public constructor(private readonly config: Pick<WorkstationConfig, "tabletWsPort">) {}

  public async start(): Promise<void> {
    if (this.server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const server = new WebSocketServer({ port: this.config.tabletWsPort });
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        this.server = server;
        this.attachServerHandlers(server);
        this.startPingLoop();
        logger.info("tablet bridge started", { port: this.config.tabletWsPort });
        resolve();
      };

      server.once("error", onError);
      server.once("listening", onListening);
    });
  }

  public broadcast(event: TabletEvent): void {
    if (!this.server) {
      logger.debug("tablet event skipped; server not started", { eventType: event.type });
      return;
    }

    const payload = JSON.stringify(event);
    let delivered = 0;

    for (const client of this.server.clients) {
      if (client.readyState !== WebSocket.OPEN) {
        continue;
      }

      try {
        client.send(payload);
        delivered += 1;
      } catch (error) {
        logger.warn("tablet event send failed", {
          eventType: event.type,
          error: toErrorMessage(error),
        });
      }
    }

    logger.debug("tablet event broadcast", { eventType: event.type, delivered });
  }

  public connectedCount(): number {
    return this.server ? this.server.clients.size : 0;
  }

  public async stop(): Promise<void> {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    const server = this.server;
    this.server = null;

    if (!server) {
      return;
    }

    for (const client of server.clients) {
      client.terminate();
    }

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    logger.info("tablet bridge stopped", { port: this.config.tabletWsPort });
  }

  private attachServerHandlers(server: WebSocketServer): void {
    server.on("connection", (socket, request) => {
      const client = socket as TabletClientSocket;
      const remoteAddress = request.socket.remoteAddress ?? "unknown";
      client.isAlive = true;

      logger.info("tablet connected", {
        remoteAddress,
        clients: server.clients.size,
      });

      this.broadcast({ type: "status", data: { connectedTablets: server.clients.size } });

      client.on("pong", () => {
        client.isAlive = true;
      });

      client.on("close", () => {
        logger.info("tablet disconnected", {
          remoteAddress,
          clients: server.clients.size,
        });

        this.broadcast({ type: "status", data: { connectedTablets: server.clients.size } });
      });

      client.on("error", (error) => {
        logger.warn("tablet socket error", {
          remoteAddress,
          error: toErrorMessage(error),
        });
      });
    });

    server.on("error", (error) => {
      logger.error("tablet bridge server error", { error: toErrorMessage(error) });
    });
  }

  private startPingLoop(): void {
    if (!this.server || this.pingTimer) {
      return;
    }

    this.pingTimer = setInterval(() => {
      const server = this.server;
      if (!server) {
        return;
      }

      for (const socket of server.clients) {
        const client = socket as TabletClientSocket;
        if (!client.isAlive) {
          logger.warn("terminating stale tablet connection");
          client.terminate();
          continue;
        }

        client.isAlive = false;
        client.ping();
      }
    }, 30_000);
  }
}
