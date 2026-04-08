import { CentralApiClient } from "../api/client.js";
import { DbClient } from "../db/client.js";
import { createLogger } from "../logger.js";
import type {
  DetectionUploadRequest,
  FlushSummary,
  MatchEventUploadRequest,
  PendingDetection,
  PendingMatchEvent,
  WorkstationConfig,
} from "../types.js";

const logger = createLogger("sync-outbox");

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toDetectionUploadRequest(
  detection: PendingDetection,
): DetectionUploadRequest {
  return {
    externalEventId: detection.externalEventId,
    plate: detection.plate,
    occurredAt: detection.occurredAt,
    hitlistId: detection.hitlistId,
    country: detection.country,
    make: detection.make,
    model: detection.model,
    color: detection.color,
    category: detection.category,
    confidence: detection.confidence,
    snapshotUrl: detection.snapshotPath,
  };
}

function toMatchEventUploadRequest(
  matchEvent: PendingMatchEvent,
): MatchEventUploadRequest {
  return {
    externalEventId: matchEvent.externalEventId,
    detectionId: matchEvent.detectionId,
    hitlistEntryId: matchEvent.hitlistEntryId,
    alertStatus: matchEvent.alertStatus,
    note: matchEvent.note,
  };
}

function computeNextRetryAt(
  attempts: number,
  baseDelayMs: number,
  maxDelayMs: number,
): string {
  const delay = Math.min(baseDelayMs * 2 ** attempts, maxDelayMs);
  const jitter = Math.floor(Math.random() * 2000);
  return new Date(Date.now() + delay + jitter).toISOString();
}

export class OutboxFlusher {
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  public constructor(
    private readonly api: CentralApiClient,
    private readonly db: DbClient,
    config?: Pick<
      WorkstationConfig,
      "outboxMaxRetries" | "outboxRetryBaseDelayMs" | "outboxRetryMaxDelayMs"
    >,
  ) {
    this.maxRetries = config?.outboxMaxRetries ?? 10;
    this.baseDelayMs = config?.outboxRetryBaseDelayMs ?? 5000;
    this.maxDelayMs = config?.outboxRetryMaxDelayMs ?? 300000;
  }

  public async flush(
    matchEventBatchSize: number,
    detectionBatchSize: number = matchEventBatchSize,
  ): Promise<FlushSummary> {
    const summary: FlushSummary = {
      matchEventsSynced: 0,
      detectionsSynced: 0,
      matchEventsRetried: 0,
      detectionsRetried: 0,
      matchEventsFailed: 0,
      detectionsFailed: 0,
      errors: 0,
    };

    const now = new Date().toISOString();

    const matchEvents = this.db.getRetryableMatchEvents(
      matchEventBatchSize,
      now,
    );
    for (const matchEvent of matchEvents) {
      await this.syncMatchEvent(matchEvent, summary);
    }

    const detections = this.db.getRetryableDetections(detectionBatchSize, now);
    for (const detection of detections) {
      await this.syncDetection(detection, summary);
    }

    if (
      summary.matchEventsSynced > 0 ||
      summary.detectionsSynced > 0 ||
      summary.errors > 0
    ) {
      logger.debug("outbox flush completed", { ...summary });
    }

    return summary;
  }

  private async syncMatchEvent(
    matchEvent: PendingMatchEvent,
    summary: FlushSummary,
  ): Promise<void> {
    const attempts = (matchEvent.attempts ?? 0) + 1;

    try {
      await this.api.uploadMatchEvent(toMatchEventUploadRequest(matchEvent));
      this.db.markMatchEventSynced(matchEvent.id, new Date().toISOString());
      summary.matchEventsSynced += 1;
    } catch (error) {
      summary.errors += 1;

      if (attempts >= this.maxRetries) {
        this.db.recordSyncAttempt(
          "pending_match_events",
          matchEvent.id,
          attempts,
          null,
          true,
        );
        summary.matchEventsFailed += 1;
        logger.warn("match event dead-lettered after max retries", {
          matchEventId: matchEvent.id,
          externalEventId: matchEvent.externalEventId,
          attempts,
          error: toErrorMessage(error),
        });
      } else {
        const nextRetryAt = computeNextRetryAt(
          attempts,
          this.baseDelayMs,
          this.maxDelayMs,
        );
        this.db.recordSyncAttempt(
          "pending_match_events",
          matchEvent.id,
          attempts,
          nextRetryAt,
          false,
        );
        summary.matchEventsRetried += 1;
        logger.error("match event upload failed, will retry", {
          matchEventId: matchEvent.id,
          externalEventId: matchEvent.externalEventId,
          attempts,
          nextRetryAt,
          error: toErrorMessage(error),
        });
      }
    }
  }

  private async syncDetection(
    detection: PendingDetection,
    summary: FlushSummary,
  ): Promise<void> {
    const attempts = (detection.attempts ?? 0) + 1;

    try {
      await this.api.uploadDetection(toDetectionUploadRequest(detection));
      this.db.markDetectionSynced(detection.id, new Date().toISOString());
      summary.detectionsSynced += 1;
    } catch (error) {
      summary.errors += 1;

      if (attempts >= this.maxRetries) {
        this.db.recordSyncAttempt(
          "pending_detections",
          detection.id,
          attempts,
          null,
          true,
        );
        summary.detectionsFailed += 1;
        logger.warn("detection dead-lettered after max retries", {
          detectionId: detection.id,
          externalEventId: detection.externalEventId,
          attempts,
          error: toErrorMessage(error),
        });
      } else {
        const nextRetryAt = computeNextRetryAt(
          attempts,
          this.baseDelayMs,
          this.maxDelayMs,
        );
        this.db.recordSyncAttempt(
          "pending_detections",
          detection.id,
          attempts,
          nextRetryAt,
          false,
        );
        summary.detectionsRetried += 1;
        logger.error("detection upload failed, will retry", {
          detectionId: detection.id,
          externalEventId: detection.externalEventId,
          attempts,
          nextRetryAt,
          error: toErrorMessage(error),
        });
      }
    }
  }
}
