import { timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket, RawData } from "ws";
import pino from "pino";
import type { Pool } from "pg";
import {
  connectDb,
  getBlacklistCollection,
  getDetectionsCollection,
  closeDb,
  DB_SCHEMA,
  BLACKLIST_COLLECTION,
  DETECTIONS_COLLECTION,
} from "./lib/db";
import {
  seedDummyBlacklist,
  getBlacklistedPlates,
  isPlateBlacklisted,
} from "./lib/blacklistService";
import type { BlacklistResult } from "./lib/blacklistService";
import {
  saveDetection,
  getRecentDetections,
} from "./lib/detectionService";
import type { Detection } from "./lib/detectionService";
import { refreshHitlistCache } from "./lib/hitlistClient";

const logger = pino({ name: "ws-server", level: process.env.LOG_LEVEL ?? "info" });

// ── Environment ──────────────────────────────────────────────────────────────

const VEHICLE_API_KEY =
  process.env.VEHICLE_API_KEY || process.env.CARMEN_API_KEY || "";
const VEHICLE_API_BASE =
  process.env.VEHICLE_API_BASE ||
  "https://ap-southeast-1.api.carmencloud.com/vehicle";
const parsedWsPort = parseInt(process.env.WS_PORT || "3002", 10);
const WS_PORT = Number.isFinite(parsedWsPort) ? parsedWsPort : 3002;
const WS_ADMIN_TOKEN = process.env.WS_ADMIN_TOKEN || "";
const parsedDbRetryMs = parseInt(process.env.DB_RETRY_MS || "5000", 10);
const DB_RETRY_MS =
  Number.isFinite(parsedDbRetryMs) && parsedDbRetryMs > 0
    ? parsedDbRetryMs
    : 5000;
const SHOULD_SEED_DUMMY_BLACKLIST =
  process.env.SEED_DUMMY_BLACKLIST === "true";

const DEDUP_MS = 8000;

// ── DB state ─────────────────────────────────────────────────────────────────

let blacklistCollection: string | null = null;
let detectionsCollection: string | null = null;
let db: Pool | null = null;
let dbInitPromise: Promise<Pool> | null = null;
let dbRetryTimer: ReturnType<typeof setTimeout> | null = null;
let hitlistInterval: ReturnType<typeof setInterval> | null = null;

function startHitlistPolling(): void {
  if (hitlistInterval) return;
  void refreshHitlistCache().catch(() => {});
  hitlistInterval = setInterval(() => { refreshHitlistCache().catch(() => {}); }, 60_000);
}

function stopHitlistPolling(): void {
  if (!hitlistInterval) return;
  clearInterval(hitlistInterval);
  hitlistInterval = null;
}

function resetDbState(): void {
  db = null;
  blacklistCollection = null;
  detectionsCollection = null;
}

function clearDbRetryTimer(): void {
  if (!dbRetryTimer) return;
  clearTimeout(dbRetryTimer);
  dbRetryTimer = null;
}

function scheduleDbRetry(): void {
  if (dbRetryTimer) return;

  logger.info({ retryMs: DB_RETRY_MS }, "retrying DB initialization");
  dbRetryTimer = setTimeout(() => {
    dbRetryTimer = null;
    void initDb()
      .then(() => { startHitlistPolling(); })
      .catch(() => {});
  }, DB_RETRY_MS);
}

async function handleDbFailure(err: unknown, message: string): Promise<void> {
  const errMsg = err instanceof Error ? err.message : String(err);
  logger.error({ err: errMsg }, message);
  resetDbState();
  await closeDb().catch(() => {});
  scheduleDbRetry();
}

async function initDb(): Promise<Pool> {
  if (db && blacklistCollection && detectionsCollection) return db;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    const connection = await connectDb();
    const blacklistTable = await getBlacklistCollection();
    const detectionsTable = await getDetectionsCollection();

    db = connection;
    blacklistCollection = blacklistTable;
    detectionsCollection = detectionsTable;

    if (SHOULD_SEED_DUMMY_BLACKLIST) {
      const seedResult = await seedDummyBlacklist(connection, blacklistTable);
      logger.info(
        { schema: DB_SCHEMA, table: BLACKLIST_COLLECTION, inserted: seedResult.inserted, skipped: seedResult.skipped },
        "blacklist table connected (seeded)",
      );
    } else {
      logger.info(
        { schema: DB_SCHEMA, table: BLACKLIST_COLLECTION },
        "blacklist table connected (seed disabled)",
      );
    }

    logger.info(
      { schema: DB_SCHEMA, table: DETECTIONS_COLLECTION },
      "detections table connected",
    );
    clearDbRetryTimer();
    return connection;
  })();

  try {
    return await dbInitPromise;
  } catch (err) {
    await handleDbFailure(err, "failed to initialize DB");
    throw err;
  } finally {
    dbInitPromise = null;
  }
}

async function ensureDbReady(): Promise<boolean> {
  if (db && blacklistCollection && detectionsCollection) return true;

  try {
    await initDb();
    return true;
  } catch {
    return false;
  }
}

function tokensMatch(expected: string, received: unknown): boolean {
  if (!expected || typeof received !== "string") return false;

  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(received);

  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

function privilegedAccessMessage(): string {
  return WS_ADMIN_TOKEN
    ? "Authentication required."
    : "Privileged websocket access is disabled.";
}

// ── WebSocket server ─────────────────────────────────────────────────────────

const wss = new WebSocketServer({ port: WS_PORT });
logger.info({ port: WS_PORT }, "Carmen ANPR WS server started");

void initDb()
  .then(() => { startHitlistPolling(); })
  .catch(() => {});

process.on("SIGINT", async () => {
  stopHitlistPolling();
  await closeDb().catch(() => {});
  process.exit(0);
});

process.on("SIGTERM", async () => {
  stopHitlistPolling();
  await closeDb().catch(() => {});
  process.exit(0);
});

// ── Message types ────────────────────────────────────────────────────────────

interface AuthenticateMessage {
  type: "authenticate";
  token?: string;
}

interface StartMessage {
  type: "start";
  region?: string;
  continuous?: boolean;
  workstationAddress?: string;
}

interface GetBlacklistMessage {
  type: "getBlacklist";
}

interface GetRecentDetectionsMessage {
  type: "getRecentDetections";
  limit?: number;
}

interface ViewCameraMessage {
  type: "viewCamera";
  workstationAddress: string;
}

interface ListCamerasMessage {
  type: "listCameras";
}

type ClientMessage =
  | AuthenticateMessage
  | StartMessage
  | GetBlacklistMessage
  | GetRecentDetectionsMessage
  | ViewCameraMessage
  | ListCamerasMessage;

// ── Vehicle API types ────────────────────────────────────────────────────────

interface VehiclePlate {
  found?: boolean;
  unicodeText?: string;
  country?: string;
  confidence?: number;
}

interface VehicleMmr {
  category?: string;
  make?: string;
  model?: string;
  colorName?: string;
}

interface VehicleEntry {
  plate?: VehiclePlate;
  mmr?: VehicleMmr;
}

interface VehicleApiResponse {
  data?: {
    vehicles?: VehicleEntry[];
  };
}

// ── Connection handler ───────────────────────────────────────────────────────

const cameraViewers = new Map<string, Set<WebSocket>>();
const latestFrames = new Map<string, Buffer>();
const wsToWorkstation = new Map<WebSocket, string>();
const wsToViewerAddresses = new Map<WebSocket, Set<string>>();

wss.on("connection", (ws: WebSocket) => {
  logger.info("client connected");

  let region = "sas";
  let started = false;
  let stopped = false;
  let continuous = false;
  let privileged = false;
  let processing = false;
  let queuedFrame: Buffer | null = null;
  let workstationAddress = "";
  const lastSeen = new Map<string, number>();

  ws.on("message", async (data: RawData, isBinary: boolean) => {
    if (stopped) return;

    if (!isBinary) {
      try {
        const msg = JSON.parse(data.toString()) as ClientMessage;
        if (msg.type === "authenticate") {
          if (!WS_ADMIN_TOKEN) {
            ws.send(
              JSON.stringify({
                type: "auth",
                success: false,
                message: "Privileged websocket access is disabled.",
              }),
            );
            return;
          }

          privileged = tokensMatch(WS_ADMIN_TOKEN, (msg as AuthenticateMessage).token);
          ws.send(
            JSON.stringify({
              type: "auth",
              success: privileged,
              message: privileged ? "Authenticated." : "Invalid websocket token.",
            }),
          );
        } else if (msg.type === "start" && !started) {
          if (!VEHICLE_API_KEY) {
            ws.send(
              JSON.stringify({
                type: "error",
                message:
                  "Realtime scanning is not configured: missing VEHICLE_API_KEY.",
              }),
            );
            stopped = true;
            return;
          }
          started = true;
          region = ((msg as StartMessage).region || "sas").toLowerCase();
          continuous = Boolean((msg as StartMessage).continuous);
          const wsAddress = typeof (msg as StartMessage).workstationAddress === "string"
            ? String((msg as StartMessage).workstationAddress)
            : "";
          workstationAddress = wsAddress;
          if (workstationAddress) {
            wsToWorkstation.set(ws, workstationAddress);
          }
          logger.info({ region, continuous, workstationAddress }, "session started");
          ws.send(JSON.stringify({ type: "ready" }));
        } else if (msg.type === "getBlacklist") {
          if (!privileged) {
            ws.send(
              JSON.stringify({
                type: "blacklist",
                success: false,
                message: privilegedAccessMessage(),
                data: [],
              }),
            );
            return;
          }

          if (!(await ensureDbReady())) {
            ws.send(
              JSON.stringify({
                type: "blacklist",
                success: false,
                message: "Blacklist DB unavailable",
                data: [],
              }),
            );
            return;
          }

          try {
            const plates = await getBlacklistedPlates(db!, blacklistCollection!, 100);
            ws.send(
              JSON.stringify({
                type: "blacklist",
                success: true,
                count: plates.length,
                data: plates,
              }),
            );
          } catch (err) {
            await handleDbFailure(err, "blacklist lookup failed");
            ws.send(
              JSON.stringify({
                type: "blacklist",
                success: false,
                message: "Blacklist DB unavailable",
                data: [],
              }),
            );
          }
        } else if (msg.type === "getRecentDetections") {
          if (!privileged) {
            ws.send(
              JSON.stringify({
                type: "recentDetections",
                success: false,
                message: privilegedAccessMessage(),
                data: [],
              }),
            );
            return;
          }

          if (!(await ensureDbReady())) {
            ws.send(
              JSON.stringify({
                type: "recentDetections",
                success: false,
                message: "Detections DB unavailable",
                data: [],
              }),
            );
            return;
          }

          const rawLimit = Number((msg as GetRecentDetectionsMessage).limit);
          const limit = rawLimit > 0 ? Math.min(rawLimit, 500) : 100;

          try {
            const detections = await getRecentDetections(
              db!,
              detectionsCollection!,
              limit,
            );
            ws.send(
              JSON.stringify({
                type: "recentDetections",
                success: true,
                count: detections.length,
                data: detections,
              }),
            );
          } catch (err) {
            await handleDbFailure(err, "recent detections lookup failed");
            ws.send(
              JSON.stringify({
                type: "recentDetections",
                success: false,
                message: "Detections DB unavailable",
                data: [],
              }),
            );
          }
        } else if (msg.type === "viewCamera") {
          const addr = (msg as ViewCameraMessage).workstationAddress;
          if (!addr) return;
          let viewers = cameraViewers.get(addr);
          if (!viewers) {
            viewers = new Set();
            cameraViewers.set(addr, viewers);
          }
          viewers.add(ws);
          let viewedAddresses = wsToViewerAddresses.get(ws);
          if (!viewedAddresses) {
            viewedAddresses = new Set();
            wsToViewerAddresses.set(ws, viewedAddresses);
          }
          viewedAddresses.add(addr);
          const hasActive = latestFrames.has(addr);
          ws.send(JSON.stringify({ type: "cameraStatus", workstationAddress: addr, active: hasActive }));
          if (hasActive) {
            const frame = latestFrames.get(addr);
            if (frame) ws.send(frame);
          }
        } else if (msg.type === "listCameras") {
          const cameras: Array<{ workstationAddress: string; active: boolean }> = [];
          for (const addr of latestFrames.keys()) {
            cameras.push({ workstationAddress: addr, active: true });
          }
          ws.send(JSON.stringify({ type: "cameraList", cameras }));
        }
      } catch {
        // Ignore malformed JSON
      }
      return;
    }

    if (!started) return;

    queuedFrame = Buffer.from(data as ArrayBuffer);
    if (processing) return;
    void processLatestFrame();
  });

  async function processLatestFrame(): Promise<void> {
    if (processing || stopped || !queuedFrame) return;
    processing = true;

    while (!stopped && queuedFrame) {
      const jpegBuffer = queuedFrame;
      queuedFrame = null;
      logger.info({ bytes: jpegBuffer.length }, "frame received");

      if (workstationAddress) {
        latestFrames.set(workstationAddress, jpegBuffer);
        const viewers = cameraViewers.get(workstationAddress);
        if (viewers) {
          for (const viewer of viewers) {
            if (viewer.readyState === WebSocket.OPEN) {
              viewer.send(jpegBuffer);
            }
          }
        }
      }

      const t0 = Date.now();
      try {
        const detections = await callVehicleAPI(jpegBuffer, region);
        const elapsed = Date.now() - t0;

        if (detections.length === 0) {
          logger.info({ elapsed, bytes: jpegBuffer.length }, "frame: no plate");
        }

        const now = Date.now();
        for (const det of detections) {
          const last = lastSeen.get(det.plate) || 0;
          if (now - last < DEDUP_MS) continue;
          lastSeen.set(det.plate, now);

          logger.info(
            { plate: det.plate, country: det.country, confidence: det.confidence, elapsed },
            "plate detected",
          );

          let blacklist: BlacklistResult = {
            isBlacklisted: false,
            normalizedPlate: "",
            record: null,
          };

          if (!db || !blacklistCollection || !detectionsCollection) {
            await ensureDbReady();
          }

          if (db && blacklistCollection) {
            try {
              blacklist = await isPlateBlacklisted(
                db,
                blacklistCollection,
                det.plate,
              );
            } catch (err) {
              await handleDbFailure(err, "blacklist check failed");
            }
          }

          if (db && detectionsCollection) {
            try {
              await saveDetection(db, detectionsCollection, det, {
                region,
                blacklist,
              });
            } catch (err) {
              await handleDbFailure(err, "detection save failed");
            }
          }

          if (ws.readyState === WebSocket.OPEN && !stopped) {
            ws.send(
              JSON.stringify({
                type: "detection",
                data: {
                  ...det,
                  blacklist,
                },
              }),
            );
          }
          if (!continuous) {
            queuedFrame = null;
            stopped = true;
            break;
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error({ err: errMsg }, "frame processing error");
      }
    }

    processing = false;
    if (!stopped && queuedFrame) {
      void processLatestFrame();
    }
  }

  const cleanup = (): void => {
    if (stopped) return;
    stopped = true;
    queuedFrame = null;

    const wsAddr = wsToWorkstation.get(ws);
    if (wsAddr) {
      wsToWorkstation.delete(ws);
      latestFrames.delete(wsAddr);
      const viewers = cameraViewers.get(wsAddr);
      if (viewers) {
        const offlineMsg = JSON.stringify({ type: "cameraOffline", workstationAddress: wsAddr });
        for (const viewer of viewers) {
          if (viewer.readyState === WebSocket.OPEN) {
            viewer.send(offlineMsg);
          }
        }
        cameraViewers.delete(wsAddr);
      }
    }

    const viewedAddresses = wsToViewerAddresses.get(ws);
    if (viewedAddresses) {
      for (const addr of viewedAddresses) {
        const viewers = cameraViewers.get(addr);
        if (viewers) {
          viewers.delete(ws);
          if (viewers.size === 0) cameraViewers.delete(addr);
        }
      }
      wsToViewerAddresses.delete(ws);
    }

    logger.info("client disconnected");
  };

  ws.on("close", cleanup);
  ws.on("error", cleanup);
});

// ── Vehicle API ──────────────────────────────────────────────────────────────

async function callVehicleAPI(jpegBuffer: Buffer, region: string): Promise<Detection[]> {
  const form = new FormData();
  const blob = new Blob([jpegBuffer as unknown as BlobPart], { type: "image/jpeg" });
  form.append("image", blob, "frame.jpg");
  form.append("service", "anpr,mmr");

  const url = `${VEHICLE_API_BASE}/${region}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "X-Api-Key": VEHICLE_API_KEY },
    body: form,
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`API ${resp.status}: ${body.slice(0, 120)}`);
  }

  return parseVehicles(await resp.json() as VehicleApiResponse);
}

function parseVehicles(json: VehicleApiResponse): Detection[] {
  const results: Detection[] = [];
  for (const v of json?.data?.vehicles || []) {
    const plate = v.plate;
    if (!plate?.found || !plate?.unicodeText) continue;
    const mmr = v.mmr;
    results.push({
      timestamp: new Date().toISOString(),
      plate: plate.unicodeText,
      country: plate.country || "",
      category: mmr?.category || "",
      make: mmr?.make || "",
      model: mmr?.model || "",
      color: mmr?.colorName || "",
      confidence: plate.confidence ?? 0,
    });
  }
  return results;
}
