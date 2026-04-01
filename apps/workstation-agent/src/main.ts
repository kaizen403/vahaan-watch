import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CentralApiClient } from "./api/client.js";
import { loadConfig } from "./config.js";
import { DbClient } from "./db/client.js";
import { HeartbeatService } from "./health/heartbeat.js";
import { createLogger, setLogLevel } from "./logger.js";
import { OutboxFlusher } from "./sync/outbox.js";
import { TabletBridge } from "./tablet/bridge.js";
import type {
  AlertPayload,
  CameraFrame,
  ComponentHealth,
  DetectionEvent,
  LocalHitlistEntry,
  LogLevel,
  MatchResult,
  OcrProvider,
  PendingDetection,
  PendingMatchEvent,
  WorkstationConfig,
} from "./types.js";

interface CameraAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  grabFrame(): Promise<CameraFrame>;
  healthCheck(): Promise<{ ok: boolean; message: string }>;
}

interface CameraAdapterModule {
  FfmpegCameraAdapter: new (config: WorkstationConfig) => CameraAdapter;
}

interface OcrProviderModule {
  TesseractOcrProvider: new (config: WorkstationConfig) => OcrProvider;
}

interface SnapshotModule {
  saveSnapshot: (...args: unknown[]) => Promise<unknown>;
  cleanExpiredSnapshots: (...args: unknown[]) => Promise<unknown>;
}

const logger = createLogger("main");
const cameraAdapterModulePath: string = "./camera/adapter.js";
const ocrAdapterModulePath: string = "./ocr/adapter.js";
const snapshotModulePath: string = "./snapshot/capture.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isLogLevel(value: string): value is LogLevel {
  return value === "debug" || value === "info" || value === "warn" || value === "error";
}

function normalizePlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractSnapshotPath(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (!isRecord(value)) {
    return null;
  }

  const candidates = [value.filePath, value.snapshotPath, value.path];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}

function toComponentStatus(ok: boolean): ComponentHealth["status"] {
  return ok ? "healthy" : "unhealthy";
}

function buildVehicleDescription(entry: LocalHitlistEntry): string | null {
  const parts = [entry.vehicleColor, entry.vehicleMake, entry.vehicleModel].filter(
    (part): part is string => typeof part === "string" && part.length > 0,
  );

  return parts.length > 0 ? parts.join(" ") : null;
}

async function ensureRuntimeDirectories(config: WorkstationConfig): Promise<void> {
  await mkdir(dirname(config.dbPath), { recursive: true });
  await mkdir(config.snapshotDir, { recursive: true });
}

async function loadRuntimeModules(): Promise<{
  FfmpegCameraAdapter: CameraAdapterModule["FfmpegCameraAdapter"];
  TesseractOcrProvider: OcrProviderModule["TesseractOcrProvider"];
  saveSnapshot: SnapshotModule["saveSnapshot"];
  cleanExpiredSnapshots: SnapshotModule["cleanExpiredSnapshots"];
}> {
  const cameraModule = (await import(cameraAdapterModulePath)) as CameraAdapterModule;
  const ocrModule = (await import(ocrAdapterModulePath)) as OcrProviderModule;
  const snapshotModule = (await import(snapshotModulePath)) as SnapshotModule;

  return {
    FfmpegCameraAdapter: cameraModule.FfmpegCameraAdapter,
    TesseractOcrProvider: ocrModule.TesseractOcrProvider,
    saveSnapshot: snapshotModule.saveSnapshot,
    cleanExpiredSnapshots: snapshotModule.cleanExpiredSnapshots,
  };
}

async function bootstrapDeviceToken(api: CentralApiClient, config: WorkstationConfig): Promise<string> {
  const existingToken = process.env.DEVICE_TOKEN?.trim();
  if (existingToken) {
    api.setDeviceToken(existingToken);
    logger.info("using device token from environment", { deviceId: config.deviceId });
    return existingToken;
  }

  if (!process.env.DEVICE_PROVISIONING_TOKEN && config.deviceProvisioningToken) {
    process.env.DEVICE_PROVISIONING_TOKEN = config.deviceProvisioningToken;
  }

  const provisioningToken = process.env.DEVICE_PROVISIONING_TOKEN?.trim();
  if (!provisioningToken) {
    throw new Error("DEVICE_TOKEN or DEVICE_PROVISIONING_TOKEN is required.");
  }

  const registration = await api.register({
    deviceType: "WORKSTATION",
    deviceId: config.deviceId,
    name: config.deviceName,
  });

  api.setDeviceToken(registration.deviceToken);
  logger.info("device registered", {
    deviceId: registration.device.deviceId,
    status: registration.device.status,
  });

  return registration.deviceToken;
}

async function saveDetectionSnapshot(
  saveSnapshot: SnapshotModule["saveSnapshot"],
  db: DbClient,
  config: WorkstationConfig,
  frame: CameraFrame,
  detectionId: string,
): Promise<string | null> {
  const attempts: unknown[][] = [
    [{ db, config, frame, detectionId }],
    [db, config, frame, detectionId],
    [frame, detectionId, db, config],
  ];

  for (const args of attempts) {
    try {
      const result = await saveSnapshot(...args);
      return extractSnapshotPath(result);
    } catch (error) {
      logger.warn("snapshot capture attempt failed", {
        detectionId,
        error: toErrorMessage(error),
      });
    }
  }

  return null;
}

async function cleanupSnapshots(
  cleanExpiredSnapshots: SnapshotModule["cleanExpiredSnapshots"],
  db: DbClient,
  config: WorkstationConfig,
): Promise<void> {
  const attempts: unknown[][] = [
    [{ db, config }],
    [db, config],
    [db],
  ];

  let lastError: unknown = null;
  for (const args of attempts) {
    try {
      await cleanExpiredSnapshots(...args);
      logger.debug("snapshot cleanup completed");
      return;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError !== null) {
    throw lastError;
  }
}

async function updateRuntimeHealthSnapshots(db: DbClient, camera: CameraAdapter, ocr: OcrProvider): Promise<void> {
  const now = new Date().toISOString();

  try {
    const cameraHealth = await camera.healthCheck();
    db.upsertHealthSnapshot({
      component: "camera",
      status: toComponentStatus(cameraHealth.ok),
      message: cameraHealth.message,
      lastCheckedAt: now,
    });
  } catch (error) {
    db.upsertHealthSnapshot({
      component: "camera",
      status: "unhealthy",
      message: toErrorMessage(error),
      lastCheckedAt: now,
    });
  }

  try {
    const ocrHealth = await ocr.healthCheck();
    db.upsertHealthSnapshot({
      component: "ocr",
      status: toComponentStatus(ocrHealth.ok),
      message: ocrHealth.message,
      lastCheckedAt: now,
    });
  } catch (error) {
    db.upsertHealthSnapshot({
      component: "ocr",
      status: "unhealthy",
      message: toErrorMessage(error),
      lastCheckedAt: now,
    });
  }
}

class HitlistDownloader {
  private readonly logger = createLogger("hitlist-downloader");

  public constructor(
    private readonly api: CentralApiClient,
    private readonly db: DbClient,
    private readonly hitlistId: string | null,
  ) {}

  public async sync(): Promise<number> {
    if (!this.hitlistId) {
      this.logger.warn("hitlist sync skipped; HITLIST_ID not configured");
      return 0;
    }

    const cursor = this.db.getSyncCursor("HITLIST");
    const sinceVersion = cursor ? Number.parseInt(cursor.cursor, 10) : undefined;
    const response = await this.api.getHitlist(
      this.hitlistId,
      typeof sinceVersion === "number" && Number.isFinite(sinceVersion) ? sinceVersion : undefined,
    );

    if (!response.changed || !response.version) {
      this.db.setSyncCursor("HITLIST", String(response.currentVersionNumber));
      this.logger.debug("hitlist already current", {
        hitlistId: this.hitlistId,
        version: response.currentVersionNumber,
      });
      return 0;
    }

    this.db.clearHitlistEntries(this.hitlistId);
    const syncedAt = new Date().toISOString();

    for (const entry of response.version.entries) {
      this.db.upsertHitlistEntry({
        id: entry.id,
        hitlistId: response.hitlistId,
        plateOriginal: entry.plateOriginal,
        plateNormalized: entry.plateNormalized,
        countryOrRegion: entry.countryOrRegion,
        priority: entry.priority,
        status: entry.status,
        validFrom: entry.validFrom,
        validUntil: entry.validUntil,
        reasonSummary: entry.reasonSummary,
        vehicleMake: entry.vehicleMake,
        vehicleModel: entry.vehicleModel,
        vehicleColor: entry.vehicleColor,
        metadata: entry.tags ? JSON.stringify(entry.tags) : null,
        syncedAt,
      });
    }

    this.db.setSyncCursor("HITLIST", String(response.currentVersionNumber), syncedAt);
    this.logger.info("hitlist synced", {
      hitlistId: this.hitlistId,
      version: response.currentVersionNumber,
      entries: response.version.entries.length,
    });

    return response.version.entries.length;
  }
}

class PlateMatcher {
  public constructor(private readonly db: DbClient) {}

  public match(plate: string): MatchResult {
    const normalizedPlate = normalizePlate(plate);
    const entries = normalizedPlate ? this.db.findMatchingEntries(normalizedPlate) : [];

    return {
      matched: entries.length > 0,
      entries,
      normalizedPlate,
    };
  }
}

class TtsAnnouncer {
  private readonly logger = createLogger("tts-announcer");

  public constructor(private readonly enabled: boolean) {}

  public async announce(message: string): Promise<void> {
    if (!this.enabled) {
      return;
    }

    this.logger.info("tts announcement", { message });
  }
}

class Alerter {
  public constructor(
    private readonly tabletBridge: TabletBridge,
    private readonly ttsAnnouncer: TtsAnnouncer,
  ) {}

  public async handleMatch(
    detection: DetectionEvent,
    match: MatchResult,
    alerts: AlertPayload[],
  ): Promise<void> {
    this.tabletBridge.broadcast({ type: "detection", data: detection });
    this.tabletBridge.broadcast({
      type: "match",
      data: {
        ...match,
        detection,
      },
    });

    for (const alert of alerts) {
      this.tabletBridge.broadcast({ type: "alert", data: alert });
      await this.ttsAnnouncer.announce(alert.reasonSummary ?? `match for ${alert.plate}`);
    }
  }
}

export async function main(): Promise<void> {
  const config = loadConfig();
  setLogLevel(isLogLevel(config.logLevel) ? config.logLevel : "info");

  await ensureRuntimeDirectories(config);

  const db = new DbClient(config.dbPath);
  const api = new CentralApiClient({ baseUrl: config.centralApiUrl });
  await bootstrapDeviceToken(api, config);

  const runtimeModules = await loadRuntimeModules();
  const hitlistDownloader = new HitlistDownloader(api, db, process.env.HITLIST_ID?.trim() || null);
  const plateMatcher = new PlateMatcher(db);
  const outboxFlusher = new OutboxFlusher(api, db, config);
  const heartbeatService = new HeartbeatService(api, db, config);
  const ttsAnnouncer = new TtsAnnouncer(config.ttsEnabled);
  const tabletBridge = new TabletBridge(config);
  const alerter = new Alerter(tabletBridge, ttsAnnouncer);
  const camera = new runtimeModules.FfmpegCameraAdapter(config);
  const ocr = new runtimeModules.TesseractOcrProvider(config);
  const timerHandles: NodeJS.Timeout[] = [];
  const inFlight = {
    hitlist: false,
    heartbeat: false,
    outbox: false,
    cleanup: false,
  };

  let shuttingDown = false;
  let shutdownPromise: Promise<void> | null = null;

  const runSerialized = async <T extends keyof typeof inFlight>(
    key: T,
    taskName: string,
    operation: () => Promise<void>,
  ): Promise<void> => {
    if (shuttingDown || inFlight[key]) {
      return;
    }

    inFlight[key] = true;
    try {
      await operation();
    } catch (error) {
      logger.error(`${taskName} failed`, { error: toErrorMessage(error) });
    } finally {
      inFlight[key] = false;
    }
  };

  const shutdown = async (signal?: NodeJS.Signals): Promise<void> => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shuttingDown = true;
    shutdownPromise = (async () => {
      if (signal) {
        logger.info("shutdown requested", { signal });
      }

      for (const handle of timerHandles) {
        clearInterval(handle);
      }

      await Promise.allSettled([
        camera.stop(),
        ocr.shutdown(),
        tabletBridge.stop(),
      ]);

      db.close();
      logger.info("workstation agent stopped");
    })();

    return shutdownPromise;
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  try {
    await tabletBridge.start();
    await ocr.initialize();
    await camera.start();
    await updateRuntimeHealthSnapshots(db, camera, ocr);
    await hitlistDownloader.sync();

    await runSerialized("heartbeat", "heartbeat", async () => {
      await heartbeatService.sendHeartbeat();
      tabletBridge.broadcast({ type: "health", data: heartbeatService.getHealthReport() });
    });

    timerHandles.push(
      setInterval(() => {
        void runSerialized("hitlist", "hitlist sync", async () => {
          await hitlistDownloader.sync();
        });
      }, config.hitlistSyncIntervalMs),
    );

    timerHandles.push(
      setInterval(() => {
        void runSerialized("heartbeat", "heartbeat", async () => {
          await updateRuntimeHealthSnapshots(db, camera, ocr);
          await heartbeatService.sendHeartbeat();
          tabletBridge.broadcast({ type: "health", data: heartbeatService.getHealthReport() });
        });
      }, config.heartbeatIntervalMs),
    );

    timerHandles.push(
      setInterval(() => {
        void runSerialized("outbox", "outbox flush", async () => {
          await outboxFlusher.flush(config.outboxBatchSize);
        });
      }, config.outboxFlushIntervalMs),
    );

    timerHandles.push(
      setInterval(() => {
        void runSerialized("cleanup", "snapshot cleanup", async () => {
          await cleanupSnapshots(runtimeModules.cleanExpiredSnapshots, db, config);
        });
      }, Math.max(config.heartbeatIntervalMs, 60_000)),
    );

    const loopDelayMs = Math.max(1, Math.floor(1000 / Math.max(config.cameraFps, 1)));
    logger.info("workstation agent started", {
      deviceId: config.deviceId,
      cameraFps: config.cameraFps,
      tabletWsPort: config.tabletWsPort,
    });

    while (!shuttingDown) {
      try {
        const frame = await camera.grabFrame();
        const detections = await ocr.recognize(frame.data);

        for (const result of detections) {
          const plate = result.plate.trim();
          const normalizedPlate = normalizePlate(plate);
          if (!normalizedPlate) {
            continue;
          }

          const match = plateMatcher.match(plate);
          if (!match.matched) {
            continue;
          }

          const now = frame.timestamp.toISOString();
          const primaryEntry = match.entries[0];
          const detectionId = randomUUID();
          const snapshotPath = await saveDetectionSnapshot(
            runtimeModules.saveSnapshot,
            db,
            config,
            frame,
            detectionId,
          );

          const pendingDetection: PendingDetection = {
            id: detectionId,
            externalEventId: randomUUID(),
            plate,
            plateNormalized: normalizedPlate,
            occurredAt: now,
            confidence: result.confidence,
            snapshotPath,
            hitlistId: primaryEntry?.hitlistId ?? null,
            country: primaryEntry?.countryOrRegion ?? null,
            make: primaryEntry?.vehicleMake ?? null,
            model: primaryEntry?.vehicleModel ?? null,
            color: primaryEntry?.vehicleColor ?? null,
            synced: 0,
            syncedAt: null,
            createdAt: now,
          };

          db.insertDetection(pendingDetection);

          const detectionEvent: DetectionEvent = {
            id: pendingDetection.id,
            externalEventId: pendingDetection.externalEventId,
            plate: pendingDetection.plate,
            plateNormalized: pendingDetection.plateNormalized,
            occurredAt: pendingDetection.occurredAt,
            confidence: pendingDetection.confidence,
            snapshotPath: pendingDetection.snapshotPath,
          };

          const alerts: AlertPayload[] = [];
          for (const entry of match.entries) {
            const pendingMatchEvent: PendingMatchEvent = {
              id: randomUUID(),
              externalEventId: randomUUID(),
              detectionId: null,
              hitlistEntryId: entry.id,
              alertStatus: "PENDING",
              note: entry.reasonSummary,
              synced: 0,
              syncedAt: null,
              createdAt: now,
            };

            db.insertMatchEvent(pendingMatchEvent);
            alerts.push({
              plate,
              normalizedPlate,
              priority: entry.priority,
              hitlistEntryId: entry.id,
              reasonSummary: entry.reasonSummary,
              vehicleDescription: buildVehicleDescription(entry),
              detectionId,
              occurredAt: now,
            });
          }

          await alerter.handleMatch(detectionEvent, match, alerts);
        }
      } catch (error) {
        logger.error("frame processing failed", { error: toErrorMessage(error) });
      }

      await sleep(loopDelayMs);
    }
  } catch (error) {
    logger.error("workstation agent failed", { error: toErrorMessage(error) });
    throw error;
  } finally {
    await shutdown();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main().catch((error) => {
    logger.error("fatal error", { error: toErrorMessage(error) });
    process.exitCode = 1;
  });
}
