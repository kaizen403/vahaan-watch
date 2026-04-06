export interface DetectionEvent {
  id: string;
  externalEventId: string;
  plate: string;
  plateNormalized: string;
  occurredAt: string;
  confidence: number | null;
  snapshotPath: string | null;
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

export type WorkstationMessage =
  | { type: "detection"; data: DetectionEvent }
  | { type: "match"; data: MatchResult & { detection: DetectionEvent } }
  | { type: "alert"; data: AlertPayload }
  | { type: "health"; data: HealthReport };
