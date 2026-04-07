export type DeviceStatus = "PENDING" | "ACTIVE" | "OFFLINE" | "DISABLED";
export type HitlistStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type AlertStatus = "PENDING" | "ACKNOWLEDGED" | "ESCALATED" | "FALSE_POSITIVE" | "RESOLVED";
export type SyncScope = "HITLIST" | "DETECTIONS" | "MATCH_EVENTS" | "TELEMETRY";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface DeviceRegistrationRequest {
  deviceType: "WORKSTATION";
  deviceId: string;
  name: string;
  description?: string;
}

export interface DeviceRegistrationResponse {
  deviceType: "WORKSTATION";
  device: {
    id: string;
    deviceId: string;
    name: string;
    status: DeviceStatus;
  };
  deviceToken: string;
}

export interface SyncContractsResponse {
  version: string;
  endpoints: Record<string, string>;
}

export interface HitlistEntry {
  id: string;
  hitlistVersionId: string;
  plateOriginal: string;
  plateNormalized: string;
  countryOrRegion: string | null;
  priority: string | null;
  status: string;
  reasonCode: string | null;
  reasonSummary: string | null;
  caseReference: string | null;
  sourceAgency: string | null;
  validFrom: string | null;
  validUntil: string | null;
  tags: Record<string, unknown> | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  vehicleCategory: string | null;
  ownerName: string | null;
  ownerContact: string | null;
  extendedCaseNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HitlistSyncResponse {
  hitlistId: string;
  currentVersionNumber: number;
  changed: boolean;
  version?: {
    id: string;
    versionNumber: number;
    entries: HitlistEntry[];
    createdAt: string;
  };
}

export interface SyncCursor {
  id: string;
  deviceType: string;
  deviceKey: string;
  scope: SyncScope;
  cursor: string;
  updatedAt: string;
}

export interface LocalHitlistEntry {
  id: string;
  hitlistId: string;
  plateOriginal: string;
  plateNormalized: string;
  countryOrRegion: string | null;
  priority: string | null;
  status: string;
  validFrom: string | null;
  validUntil: string | null;
  reasonSummary: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  metadata: string | null;
  syncedAt: string;
}

export interface PendingDetection {
  id: string;
  externalEventId: string;
  plate: string;
  plateNormalized: string;
  occurredAt: string;
  confidence: number | null;
  snapshotPath: string | null;
  hitlistId: string | null;
  country: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  synced: number;
  syncedAt: string | null;
  attempts?: number;
  lastAttemptAt?: string | null;
  nextRetryAt?: string | null;
  failed?: number;
  createdAt: string;
}

export interface PendingMatchEvent {
  id: string;
  externalEventId: string;
  detectionId: string | null;
  hitlistEntryId: string | null;
  alertStatus: AlertStatus;
  note: string | null;
  synced: number;
  syncedAt: string | null;
  attempts?: number;
  lastAttemptAt?: string | null;
  nextRetryAt?: string | null;
  failed?: number;
  createdAt: string;
}

export interface FlushSummary {
  matchEventsSynced: number;
  detectionsSynced: number;
  matchEventsRetried: number;
  detectionsRetried: number;
  matchEventsFailed: number;
  detectionsFailed: number;
  errors: number;
}

export interface PendingSnapshot {
  id: string;
  detectionId: string;
  filePath: string;
  fileSize: number;
  contentType: string;
  capturedAt: string;
  compressed: number;
  uploaded: number;
  retentionUntil: string;
  createdAt: string;
}

export interface TelemetryBufferItem {
  id: string;
  kind: string;
  payload: string;
  synced: number;
  syncedAt: string | null;
  createdAt: string;
}

export interface LocalSyncState {
  scope: SyncScope;
  cursor: string;
  updatedAt: string;
}

export interface CameraFrame {
  data: Buffer;
  timestamp: Date;
  source: string;
}

export interface OcrResult {
  plate: string;
  confidence: number;
}

export interface OcrProvider {
  readonly name: string;
  initialize(): Promise<void>;
  recognize(imageBuffer: Buffer): Promise<OcrResult[]>;
  shutdown(): Promise<void>;
  healthCheck(): Promise<{ ok: boolean; message: string }>;
}

export interface DetectionEvent {
  id: string;
  externalEventId: string;
  plate: string;
  plateNormalized: string;
  occurredAt: string;
  confidence: number | null;
  snapshotPath: string | null;
}

export interface MatchResult {
  matched: boolean;
  entries: LocalHitlistEntry[];
  normalizedPlate: string;
  fuzzyMatch?: boolean;
}

export interface AlertPayload {
  plate: string;
  normalizedPlate: string;
  priority: string | null;
  hitlistEntryId: string;
  reasonSummary: string | null;
  vehicleDescription: string | null;
  detectionId: string;
  occurredAt: string;
}

export type TabletEvent =
  | { type: "detection"; data: DetectionEvent }
  | { type: "match"; data: MatchResult & { detection: DetectionEvent } }
  | { type: "alert"; data: AlertPayload }
  | { type: "health"; data: HealthReport }
  | { type: "status"; data: { connectedTablets: number } };

export interface ComponentHealth {
  component: string;
  status: "healthy" | "degraded" | "unhealthy";
  message: string;
  lastCheckedAt: string;
}

export interface HealthReport {
  overall: "healthy" | "degraded" | "unhealthy";
  components: ComponentHealth[];
  uptime: number;
  pendingDetections: number;
  pendingMatchEvents: number;
}

export interface DetectionUploadRequest {
  externalEventId: string;
  plate: string;
  occurredAt: string;
  hitlistId?: string | null;
  country?: string | null;
  make?: string | null;
  model?: string | null;
  color?: string | null;
  category?: string | null;
  confidence?: number | null;
  snapshotUrl?: string | null;
}

export interface MatchEventUploadRequest {
  externalEventId: string;
  detectionId?: string | null;
  hitlistEntryId?: string | null;
  alertStatus?: AlertStatus;
  note?: string | null;
}

export interface HeartbeatPayload {
  status: DeviceStatus;
  health?: HealthReport;
  metadata?: Record<string, unknown>;
}

export interface WorkstationConfig {
  centralApiUrl: string;
  deviceProvisioningToken: string;
  deviceId: string;
  deviceName: string;
  cameraSource: string;
  cameraFps: number;
  ocrProvider: string;
  ocrLang: string;
  dbPath: string;
  snapshotDir: string;
  snapshotRetentionDays: number;
  snapshotMaxWidth: number;
  snapshotJpegQuality: number;
  hitlistSyncIntervalMs: number;
  heartbeatIntervalMs: number;
  outboxFlushIntervalMs: number;
  outboxBatchSize: number;
  detectionBatchSize: number;
  outboxMaxRetries: number;
  outboxRetryBaseDelayMs: number;
  outboxRetryMaxDelayMs: number;
  tabletWsPort: number;
  ttsEnabled: boolean;
  fuzzyMatchEnabled: boolean;
  ocrPreprocess: boolean;
  ocrMinConfidence: number;
  ocrWorkerCount: number;
  logLevel: string;
  rtspTransport: "tcp" | "udp" | "http";
  rtspConnectTimeoutMs: number;
  rtspReadTimeoutMs: number;
  rtspReconnectMaxAttemptsPerSession: number;
  rtspStreamValidationIntervalMs: number;
  cameraSources: Array<{ url: string; label: string; fps: number }>;
  carmenBinaryPath: string;
  carmenApiKey: string;
  carmenRegion: string;
}
