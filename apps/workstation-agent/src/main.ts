import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CentralApiClient } from "./api/client.js";
import { loadConfig } from "./config.js";
import { DbClient } from "./db/client.js";
import { HeartbeatService } from "./health/heartbeat.js";
import { PlateMatcher } from "./detection/matcher.js";
import { HitlistDownloader } from "./hitlist/downloader.js";
import { createLogger, setLogLevel } from "./logger.js";
import { OutboxFlusher } from "./sync/outbox.js";
import { TabletBridge } from "./tablet/bridge.js";
import { TtsAnnouncer } from "./alert/tts.js";
import { CarmenStreamAdapter } from "./ocr/carmen-stream.js";
import { CarmenCloudOcrAdapter } from "./ocr/carmen-cloud.js";
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
  healthCheck(): Promise<ComponentHealth>;
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

interface DetectionArtifacts {
  pendingDetection: PendingDetection;
  detectionEvent: DetectionEvent;
  pendingMatchEvents: PendingMatchEvent[];
  alerts: AlertPayload[];
}

export function buildDetectionArtifacts(params: {
  plate: string;
  normalizedPlate: string;
  occurredAt: string;
  confidence: number | null;
  snapshotPath: string | null;
  match: MatchResult;
}): DetectionArtifacts {
  const detectionId = randomUUID();
  const externalEventId = randomUUID();
  const primaryEntry = params.match.matched ? params.match.entries[0] : undefined;

  const pendingDetection: PendingDetection = {
    id: detectionId,
    externalEventId,
    plate: params.plate,
    plateNormalized: params.normalizedPlate,
    occurredAt: params.occurredAt,
    confidence: params.confidence,
    snapshotPath: params.snapshotPath,
    hitlistId: primaryEntry?.hitlistId ?? null,
    country: primaryEntry?.countryOrRegion ?? null,
    make: primaryEntry?.vehicleMake ?? null,
    model: primaryEntry?.vehicleModel ?? null,
    color: primaryEntry?.vehicleColor ?? null,
    synced: 0,
    syncedAt: null,
    createdAt: params.occurredAt,
  };

  const detectionEvent: DetectionEvent = {
    id: pendingDetection.id,
    externalEventId: pendingDetection.externalEventId,
    plate: pendingDetection.plate,
    plateNormalized: pendingDetection.plateNormalized,
    occurredAt: pendingDetection.occurredAt,
    confidence: pendingDetection.confidence,
    snapshotPath: pendingDetection.snapshotPath,
  };

  const pendingMatchEvents = params.match.matched
    ? params.match.entries.map((entry) => ({
      id: randomUUID(),
      externalEventId: randomUUID(),
      detectionId: null,
      hitlistEntryId: entry.id,
      alertStatus: "PENDING" as const,
      note: entry.reasonSummary,
      synced: 0,
      syncedAt: null,
      createdAt: params.occurredAt,
    }))
    : [];

  const alerts = params.match.matched
    ? params.match.entries.map((entry) => ({
      plate: params.plate,
      normalizedPlate: params.normalizedPlate,
      priority: entry.priority,
      hitlistEntryId: entry.id,
      reasonSummary: entry.reasonSummary,
      vehicleDescription: buildVehicleDescription(entry),
      detectionId,
      occurredAt: params.occurredAt,
    }))
    : [];

  return {
    pendingDetection,
    detectionEvent,
    pendingMatchEvents,
    alerts,
  };
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

async function bootstrapDeviceToken(api: CentralApiClient, config: WorkstationConfig, db: DbClient): Promise<string> {
  const envToken = process.env.DEVICE_TOKEN?.trim();
  if (envToken) {
    api.setDeviceToken(envToken);
    logger.info("using device token from environment", { deviceId: config.deviceId });
    return envToken;
  }

  const storedToken = db.getDeviceToken();
  if (storedToken) {
    api.setDeviceToken(storedToken);
    logger.info("using persisted device token", { deviceId: config.deviceId });
    return storedToken;
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
  db.setDeviceToken(registration.deviceToken);
  logger.info("device registered and token persisted", {
    deviceId: registration.device.deviceId,
    status: registration.device.status,
  });

  return registration.deviceToken;
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
      status: cameraHealth.status,
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

async function fetchAssignedHitlistIds(api: CentralApiClient): Promise<string[]> {
  try {
    const resp = await api.getAssignedHitlists();
    return resp.hitlists.map(h => h.hitlistId);
  } catch (error) {
    logger.warn("failed to fetch assigned hitlists, using empty list", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export async function main(): Promise<void> {
  const config = loadConfig();
  setLogLevel(isLogLevel(config.logLevel) ? config.logLevel : "info");

  await ensureRuntimeDirectories(config);

  const db = new DbClient(config.dbPath);
  const api = new CentralApiClient({ baseUrl: config.centralApiUrl });
  await bootstrapDeviceToken(api, config, db);

  const useCarmenSdk = config.ocrProvider === "carmen-sdk";
  const useCarmenCloud = config.ocrProvider === "carmen";
  const useTesseract = !useCarmenSdk && !useCarmenCloud;
  const needsCamera = useTesseract || useCarmenCloud;
  const runtimeModules = needsCamera ? await loadRuntimeModules() : null;
  const hitlistDownloader = new HitlistDownloader(api, db);
  const plateMatcher = new PlateMatcher(db, config.fuzzyMatchEnabled);
  const outboxFlusher = new OutboxFlusher(api, db, config);
  const heartbeatService = new HeartbeatService(api, db, config);
  const ttsAnnouncer = new TtsAnnouncer(config);
  const tabletBridge = new TabletBridge(config);
  const alerter = new Alerter(tabletBridge, ttsAnnouncer);

  const camera = runtimeModules ? new runtimeModules.FfmpegCameraAdapter(config) : null;

  let ocr: OcrProvider | null = null;
  if (useTesseract && runtimeModules) {
    ocr = new runtimeModules.TesseractOcrProvider(config);
  } else if (useCarmenCloud) {
    ocr = new CarmenCloudOcrAdapter(config);
  }

  const carmenStream = useCarmenSdk ? new CarmenStreamAdapter(config) : null;

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

      const stopTasks: Promise<void>[] = [tabletBridge.stop()];
      if (carmenStream) stopTasks.push(carmenStream.stop());
      if (camera) stopTasks.push(camera.stop());
      if (ocr) stopTasks.push(ocr.shutdown());
      await Promise.allSettled(stopTasks);

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

  const processDetection = (
    plate: string,
    confidence: number | null,
    occurredAt: string,
    frameData: Buffer | null,
    extraFields?: { country?: string; make?: string; model?: string; color?: string; category?: string },
  ): void => {
    const normalizedPlate = normalizePlate(plate);
    if (!normalizedPlate) return;

    const match = plateMatcher.match(plate);
    let snapshotPath: string | null = null;

    if (match.matched && frameData && runtimeModules) {
      runtimeModules.saveSnapshot(frameData, config).then((result: unknown) => {
        const path = extractSnapshotPath(result);
        if (path) {
          logger.debug("snapshot saved for match", { plate: normalizedPlate, path });
        }
      }).catch((err: unknown) => {
        logger.warn("snapshot capture failed", { plate: normalizedPlate, error: toErrorMessage(err) });
      });
    }

    const artifacts = buildDetectionArtifacts({
      plate,
      normalizedPlate,
      occurredAt,
      confidence,
      snapshotPath,
      match,
    });

    if (extraFields) {
      if (extraFields.country) artifacts.pendingDetection.country = extraFields.country;
      if (extraFields.make) artifacts.pendingDetection.make = extraFields.make;
      if (extraFields.model) artifacts.pendingDetection.model = extraFields.model;
      if (extraFields.color) artifacts.pendingDetection.color = extraFields.color;
    }

    db.insertDetection(artifacts.pendingDetection);

    for (const pendingMatchEvent of artifacts.pendingMatchEvents) {
      db.insertMatchEvent(pendingMatchEvent);
    }

    tabletBridge.broadcast({ type: "detection", data: artifacts.detectionEvent });

    if (match.matched) {
      void alerter.handleMatch(artifacts.detectionEvent, match, artifacts.alerts);
    }
  };

  try {
    await tabletBridge.start();
    await hitlistDownloader.syncAll(await fetchAssignedHitlistIds(api));

    await runSerialized("heartbeat", "heartbeat", async () => {
      await heartbeatService.sendHeartbeat();
      tabletBridge.broadcast({ type: "health", data: heartbeatService.getHealthReport() });
    });

    timerHandles.push(
      setInterval(() => {
        void runSerialized("hitlist", "hitlist sync", async () => {
          await hitlistDownloader.syncAll(await fetchAssignedHitlistIds(api));
        });
      }, config.hitlistSyncIntervalMs),
    );

    timerHandles.push(
      setInterval(() => {
        void runSerialized("heartbeat", "heartbeat", async () => {
          if (camera && ocr) {
            await updateRuntimeHealthSnapshots(db, camera, ocr);
          }
          await heartbeatService.sendHeartbeat();
          tabletBridge.broadcast({ type: "health", data: heartbeatService.getHealthReport() });
        });
      }, config.heartbeatIntervalMs),
    );

    timerHandles.push(
      setInterval(() => {
        void runSerialized("outbox", "outbox flush", async () => {
          await outboxFlusher.flush(config.outboxBatchSize, config.detectionBatchSize);
        });
      }, config.outboxFlushIntervalMs),
    );

    if (runtimeModules) {
      timerHandles.push(
        setInterval(() => {
          void runSerialized("cleanup", "snapshot cleanup", async () => {
            await cleanupSnapshots(runtimeModules.cleanExpiredSnapshots, db, config);
          });
        }, Math.max(config.heartbeatIntervalMs, 60_000)),
      );
    }

    if (useCarmenSdk && carmenStream) {
      logger.info("workstation agent started (carmen mode)", {
        deviceId: config.deviceId,
        region: config.carmenRegion,
        tabletWsPort: config.tabletWsPort,
      });

      await carmenStream.start((detection) => {
        if (shuttingDown) return;
        const occurredAt = new Date(detection.timestamp).toISOString();
        processDetection(detection.plate, null, occurredAt, null, {
          country: detection.country,
          make: detection.make,
          model: detection.model,
          color: detection.color,
          category: detection.category,
        });
      });

      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (shuttingDown) {
            clearInterval(check);
            resolve();
          }
        }, 200);
        timerHandles.push(check);
      });
    } else if (camera && ocr) {
      await ocr.initialize();
      await camera.start();
      await updateRuntimeHealthSnapshots(db, camera, ocr);

      const loopDelayMs = Math.max(1, Math.floor(1000 / Math.max(config.cameraFps, 1)));
      logger.info(`workstation agent started (${useCarmenCloud ? "carmen-cloud" : "tesseract"} mode)`, {
        deviceId: config.deviceId,
        cameraFps: config.cameraFps,
        tabletWsPort: config.tabletWsPort,
      });

      while (!shuttingDown) {
        try {
          const frame = await camera.grabFrame();

          if (useCarmenCloud && !tabletBridge.isScanningActive()) {
            await sleep(loopDelayMs);
            continue;
          }

          const detections = await ocr.recognize(frame.data);

          for (const result of detections) {
            processDetection(
              result.plate.trim(),
              result.confidence,
              frame.timestamp.toISOString(),
              frame.data,
              result.country ? {
                country: result.country,
                make: result.make,
                model: result.model,
                color: result.color,
                category: result.category,
              } : undefined,
            );
          }
        } catch (error) {
          logger.error("frame processing failed", { error: toErrorMessage(error) });
        }

        await sleep(loopDelayMs);
      }
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
