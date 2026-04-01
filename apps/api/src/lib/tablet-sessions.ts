import { createLogger } from "./logger.js";

const logger = createLogger("tablet-sessions");

export interface TabletConnection {
  deviceKey: string;
  workstationId: string | null;
  tabletId: string | null;
  connectedAt: Date;
  lastCursor: string;
  send: (event: string, data: string) => void;
  close: () => void;
}

const connections = new Map<string, TabletConnection>();

export function registerTablet(conn: TabletConnection): void {
  const existing = connections.get(conn.deviceKey);
  if (existing) {
    existing.close();
  }
  connections.set(conn.deviceKey, conn);
  logger.info({ deviceKey: conn.deviceKey, total: connections.size }, "tablet connected");
}

export function unregisterTablet(deviceKey: string): void {
  connections.delete(deviceKey);
  logger.info({ deviceKey, total: connections.size }, "tablet disconnected");
}

export function broadcastToTablets(event: string, data: string): number {
  let delivered = 0;
  for (const [deviceKey, conn] of connections) {
    try {
      conn.send(event, data);
      delivered++;
    } catch {
      logger.warn({ deviceKey }, "failed to deliver to tablet, removing");
      connections.delete(deviceKey);
    }
  }
  return delivered;
}

export function sendToWorkstationTablets(workstationId: string, event: string, data: string): number {
  let delivered = 0;
  for (const [deviceKey, conn] of connections) {
    if (conn.workstationId === workstationId) {
      try {
        conn.send(event, data);
        delivered++;
      } catch {
        logger.warn({ deviceKey }, "failed to deliver to tablet, removing");
        connections.delete(deviceKey);
      }
    }
  }
  return delivered;
}

export function getConnectedTabletCount(): number {
  return connections.size;
}

export function getConnectedDeviceKeys(): string[] {
  return Array.from(connections.keys());
}
