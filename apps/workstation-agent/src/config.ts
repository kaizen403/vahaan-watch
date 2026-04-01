import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { WorkstationConfig } from "./types.js";

function loadDotenv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadDotenv();

function required(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Missing required env: ${key}`);
  }
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

function int(key: string, fallback: number): number {
  const raw = process.env[key];
  return raw ? parseInt(raw, 10) : fallback;
}

function bool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (!raw) {
    return fallback;
  }
  return raw === "true" || raw === "1";
}

export function loadConfig(): WorkstationConfig {
  return Object.freeze({
    centralApiUrl: required("CENTRAL_API_URL"),
    deviceProvisioningToken: optional("DEVICE_PROVISIONING_TOKEN", ""),
    deviceId: required("DEVICE_ID"),
    deviceName: required("DEVICE_NAME"),
    cameraSource: optional("CAMERA_SOURCE", ""),
    cameraFps: int("CAMERA_FPS", 2),
    ocrProvider: optional("OCR_PROVIDER", "tesseract"),
    ocrLang: optional("OCR_LANG", "eng"),
    dbPath: optional("DB_PATH", "./data/workstation.db"),
    snapshotDir: optional("SNAPSHOT_DIR", "./data/snapshots"),
    snapshotRetentionDays: int("SNAPSHOT_RETENTION_DAYS", 30),
    snapshotMaxWidth: int("SNAPSHOT_MAX_WIDTH", 1280),
    snapshotJpegQuality: int("SNAPSHOT_JPEG_QUALITY", 80),
    hitlistSyncIntervalMs: int("HITLIST_SYNC_INTERVAL_MS", 60000),
    heartbeatIntervalMs: int("HEARTBEAT_INTERVAL_MS", 30000),
    outboxFlushIntervalMs: int("OUTBOX_FLUSH_INTERVAL_MS", 15000),
    outboxBatchSize: int("OUTBOX_BATCH_SIZE", 20),
    outboxMaxRetries: int("OUTBOX_MAX_RETRIES", 10),
    outboxRetryBaseDelayMs: int("OUTBOX_RETRY_BASE_DELAY_MS", 5000),
    outboxRetryMaxDelayMs: int("OUTBOX_RETRY_MAX_DELAY_MS", 300000),
    tabletWsPort: int("TABLET_WS_PORT", 8089),
    ttsEnabled: bool("TTS_ENABLED", true),
    logLevel: optional("LOG_LEVEL", "info"),
  });
}
