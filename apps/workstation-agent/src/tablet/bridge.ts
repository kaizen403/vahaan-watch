import { WebSocket, WebSocketServer } from "ws";
import { createLogger } from "../logger.js";
import type { TabletEvent, WorkstationConfig } from "../types.js";

type ClientRole = "tablet" | "workstation" | "unknown";

interface TabletClientSocket extends WebSocket {
  isAlive: boolean;
  clientRole: ClientRole;
}

const logger = createLogger("tablet-bridge");

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class TabletBridge {
  private server: WebSocketServer | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private scanningActive = false;
  private healthProvider: (() => object) | null = null;

  public constructor(private readonly config: Pick<WorkstationConfig, "tabletWsPort">) {}

  public setHealthProvider(fn: () => object): void {
    this.healthProvider = fn;
  }

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

  public isScanningActive(): boolean {
    return this.scanningActive;
  }

  public connectedCount(): number {
    return this.tabletCount();
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

  private tabletCount(): number {
    if (!this.server) return 0;
    let count = 0;
    for (const socket of this.server.clients) {
      const client = socket as TabletClientSocket;
      if (client.readyState === WebSocket.OPEN && client.clientRole === "tablet") {
        count++;
      }
    }
    return count;
  }

  private attachServerHandlers(server: WebSocketServer): void {
    server.on("connection", (socket, request) => {
      const client = socket as TabletClientSocket;
      const remoteAddress = request.socket.remoteAddress ?? "unknown";
      client.isAlive = true;
      client.clientRole = "unknown";

      logger.info("client connected to bridge", {
        remoteAddress,
        clients: server.clients.size,
      });

      this.broadcast({ type: "status", data: { connectedTablets: this.tabletCount() } });

      client.on("message", (rawData) => {
        try {
          const msg = JSON.parse(rawData.toString()) as { type: string; role?: string };
          if (msg.type === "identify" && (msg.role === "tablet" || msg.role === "workstation")) {
            client.clientRole = msg.role;
            logger.debug("client identified", { remoteAddress, role: msg.role });
            this.broadcast({ type: "status", data: { connectedTablets: this.tabletCount() } });
            if (msg.role === "tablet" && this.healthProvider) {
              try {
                client.send(JSON.stringify({ type: "health", data: this.healthProvider() }));
              } catch {
              }
            }
          } else if (msg.type === "scanStart") {
            this.scanningActive = true;
            logger.info("scan session started");
          } else if (msg.type === "scanStop") {
            this.scanningActive = false;
            logger.info("scan session stopped");
          }
        } catch {
        }
      });

      client.on("pong", () => {
        client.isAlive = true;
      });

      client.on("close", () => {
        if (client.clientRole === "workstation") {
          this.scanningActive = false;
          logger.info("scan session stopped (workstation disconnected)");
        }

        logger.info("client disconnected from bridge", {
          remoteAddress,
          clients: server.clients.size,
        });

        this.broadcast({ type: "status", data: { connectedTablets: this.tabletCount() } });
      });

      client.on("error", (error) => {
        logger.warn("client socket error", {
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
          logger.warn("terminating stale connection");
          client.terminate();
          continue;
        }

        client.isAlive = false;
        client.ping();
      }
    }, 30_000);
  }
}
