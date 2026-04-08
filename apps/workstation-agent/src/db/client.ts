import Database from "better-sqlite3";
import { applySchemaMigrations, SCHEMA_DDL } from "./schema.js";
import type {
  ComponentHealth,
  LocalHitlistEntry,
  LocalSyncState,
  PendingDetection,
  PendingMatchEvent,
  PendingSnapshot,
  SyncScope,
  TelemetryBufferItem,
} from "../types.js";

export class DbClient {
  private readonly db: Database.Database;

  public constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    for (const ddl of SCHEMA_DDL) {
      this.db.exec(ddl);
    }

    applySchemaMigrations(this.db);
  }

  public close(): void {
    this.db.close();
  }

  public insertDetection(detection: PendingDetection): void {
    this.db
      .prepare(
        `
          INSERT INTO pending_detections (
            id,
            externalEventId,
            plate,
            plateNormalized,
            occurredAt,
            confidence,
            snapshotPath,
            hitlistId,
            country,
            make,
            model,
            color,
            category,
            synced,
            syncedAt,
            createdAt
          ) VALUES (
            @id,
            @externalEventId,
            @plate,
            @plateNormalized,
            @occurredAt,
            @confidence,
            @snapshotPath,
            @hitlistId,
            @country,
            @make,
            @model,
            @color,
            @category,
            @synced,
            @syncedAt,
            @createdAt
          )
          ON CONFLICT(externalEventId) DO NOTHING
        `,
      )
      .run(detection);
  }

  public getUnsyncedDetections(limit: number): PendingDetection[] {
    return this.db
      .prepare(
        `
          SELECT *
          FROM pending_detections
          WHERE synced = 0
          ORDER BY createdAt ASC
          LIMIT ?
        `,
      )
      .all(limit) as PendingDetection[];
  }

  public markDetectionSynced(id: string, syncedAt: string): void {
    this.db
      .prepare(
        `
          UPDATE pending_detections
          SET synced = 1,
              syncedAt = ?,
              nextRetryAt = NULL,
              failed = 0
          WHERE id = ?
        `,
      )
      .run(syncedAt, id);
  }

  public getRetryableDetections(
    limit: number,
    now: string,
  ): PendingDetection[] {
    return this.db
      .prepare(
        `
          SELECT *
          FROM pending_detections
          WHERE synced = 0
            AND failed = 0
            AND (nextRetryAt IS NULL OR nextRetryAt <= ?)
          ORDER BY createdAt ASC
          LIMIT ?
        `,
      )
      .all(now, limit) as PendingDetection[];
  }

  public insertMatchEvent(matchEvent: PendingMatchEvent): void {
    this.db
      .prepare(
        `
          INSERT INTO pending_match_events (
            id,
            externalEventId,
            detectionId,
            hitlistEntryId,
            alertStatus,
            note,
            synced,
            syncedAt,
            createdAt
          ) VALUES (
            @id,
            @externalEventId,
            @detectionId,
            @hitlistEntryId,
            @alertStatus,
            @note,
            @synced,
            @syncedAt,
            @createdAt
          )
          ON CONFLICT(externalEventId) DO NOTHING
        `,
      )
      .run(matchEvent);
  }

  public getUnsyncedMatchEvents(limit: number): PendingMatchEvent[] {
    return this.db
      .prepare(
        `
          SELECT *
          FROM pending_match_events
          WHERE synced = 0
          ORDER BY createdAt ASC
          LIMIT ?
        `,
      )
      .all(limit) as PendingMatchEvent[];
  }

  public markMatchEventSynced(id: string, syncedAt: string): void {
    this.db
      .prepare(
        `
          UPDATE pending_match_events
          SET synced = 1,
              syncedAt = ?,
              nextRetryAt = NULL,
              failed = 0
          WHERE id = ?
        `,
      )
      .run(syncedAt, id);
  }

  public getRetryableMatchEvents(
    limit: number,
    now: string,
  ): PendingMatchEvent[] {
    return this.db
      .prepare(
        `
          SELECT *
          FROM pending_match_events
          WHERE synced = 0
            AND failed = 0
            AND (nextRetryAt IS NULL OR nextRetryAt <= ?)
          ORDER BY createdAt ASC
          LIMIT ?
        `,
      )
      .all(now, limit) as PendingMatchEvent[];
  }

  public recordSyncAttempt(
    table: "pending_detections" | "pending_match_events",
    id: string,
    attempts: number,
    nextRetryAt: string | null,
    failed: boolean,
  ): void {
    const resolvedTable = this.resolvePendingTable(table);

    this.db
      .prepare(
        `
          UPDATE ${resolvedTable}
          SET attempts = @attempts,
              lastAttemptAt = @lastAttemptAt,
              nextRetryAt = @nextRetryAt,
              failed = @failed
          WHERE id = @id
        `,
      )
      .run({
        id,
        attempts,
        lastAttemptAt: new Date().toISOString(),
        nextRetryAt,
        failed: failed ? 1 : 0,
      });
  }

  public getQueueDepth(): {
    pendingDetections: number;
    pendingMatchEvents: number;
    failedDetections: number;
    failedMatchEvents: number;
  } {
    return {
      pendingDetections: this.countRows(
        `
          SELECT COUNT(*) AS count
          FROM pending_detections
          WHERE synced = 0 AND failed = 0
        `,
      ),
      pendingMatchEvents: this.countRows(
        `
          SELECT COUNT(*) AS count
          FROM pending_match_events
          WHERE synced = 0 AND failed = 0
        `,
      ),
      failedDetections: this.countRows(
        `
          SELECT COUNT(*) AS count
          FROM pending_detections
          WHERE synced = 0 AND failed = 1
        `,
      ),
      failedMatchEvents: this.countRows(
        `
          SELECT COUNT(*) AS count
          FROM pending_match_events
          WHERE synced = 0 AND failed = 1
        `,
      ),
    };
  }

  public resetFailedItems(
    table: "pending_detections" | "pending_match_events",
  ): number {
    const resolvedTable = this.resolvePendingTable(table);
    const result = this.db
      .prepare(
        `
          UPDATE ${resolvedTable}
          SET failed = 0,
              attempts = 0,
              lastAttemptAt = NULL,
              nextRetryAt = NULL
          WHERE synced = 0
            AND failed = 1
        `,
      )
      .run();

    return result.changes;
  }

  public upsertHitlistEntry(entry: LocalHitlistEntry): void {
    this.db
      .prepare(
        `
          INSERT INTO local_hitlist_entries (
            id,
            hitlistId,
            plateOriginal,
            plateNormalized,
            countryOrRegion,
            priority,
            status,
            validFrom,
            validUntil,
            reasonSummary,
            vehicleMake,
            vehicleModel,
            vehicleColor,
            metadata,
            syncedAt
          ) VALUES (
            @id,
            @hitlistId,
            @plateOriginal,
            @plateNormalized,
            @countryOrRegion,
            @priority,
            @status,
            @validFrom,
            @validUntil,
            @reasonSummary,
            @vehicleMake,
            @vehicleModel,
            @vehicleColor,
            @metadata,
            @syncedAt
          )
          ON CONFLICT(id) DO UPDATE SET
            hitlistId = excluded.hitlistId,
            plateOriginal = excluded.plateOriginal,
            plateNormalized = excluded.plateNormalized,
            countryOrRegion = excluded.countryOrRegion,
            priority = excluded.priority,
            status = excluded.status,
            validFrom = excluded.validFrom,
            validUntil = excluded.validUntil,
            reasonSummary = excluded.reasonSummary,
            vehicleMake = excluded.vehicleMake,
            vehicleModel = excluded.vehicleModel,
            vehicleColor = excluded.vehicleColor,
            metadata = excluded.metadata,
            syncedAt = excluded.syncedAt
        `,
      )
      .run(entry);
  }

  public findMatchingEntries(plateNormalized: string): LocalHitlistEntry[] {
    return this.db
      .prepare(
        `
          SELECT *
          FROM local_hitlist_entries
          WHERE plateNormalized = ?
          ORDER BY priority DESC, syncedAt DESC
        `,
      )
      .all(plateNormalized) as LocalHitlistEntry[];
  }

  public clearHitlistEntries(hitlistId: string): number {
    const result = this.db
      .prepare("DELETE FROM local_hitlist_entries WHERE hitlistId = ?")
      .run(hitlistId);

    return result.changes;
  }

  public replaceHitlistEntries(
    hitlistId: string,
    entries: LocalHitlistEntry[],
    syncedAt: string,
  ): number {
    const clear = this.db.prepare(
      "DELETE FROM local_hitlist_entries WHERE hitlistId = ?",
    );
    const upsert = this.db.prepare(`
      INSERT INTO local_hitlist_entries (
        id,
        hitlistId,
        plateOriginal,
        plateNormalized,
        countryOrRegion,
        priority,
        status,
        validFrom,
        validUntil,
        reasonSummary,
        vehicleMake,
        vehicleModel,
        vehicleColor,
        metadata,
        syncedAt
      ) VALUES (
        @id,
        @hitlistId,
        @plateOriginal,
        @plateNormalized,
        @countryOrRegion,
        @priority,
        @status,
        @validFrom,
        @validUntil,
        @reasonSummary,
        @vehicleMake,
        @vehicleModel,
        @vehicleColor,
        @metadata,
        @syncedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        plateOriginal = excluded.plateOriginal,
        plateNormalized = excluded.plateNormalized,
        countryOrRegion = excluded.countryOrRegion,
        priority = excluded.priority,
        status = excluded.status,
        validFrom = excluded.validFrom,
        validUntil = excluded.validUntil,
        reasonSummary = excluded.reasonSummary,
        vehicleMake = excluded.vehicleMake,
        vehicleModel = excluded.vehicleModel,
        vehicleColor = excluded.vehicleColor,
        metadata = excluded.metadata,
        syncedAt = excluded.syncedAt
    `);

    const transaction = this.db.transaction(
      (id: string, rows: LocalHitlistEntry[]) => {
        clear.run(id);
        for (const row of rows) {
          upsert.run({ ...row, syncedAt });
        }
        return rows.length;
      },
    );

    return transaction(hitlistId, entries) as number;
  }

  public insertSnapshot(snapshot: PendingSnapshot): void {
    this.db
      .prepare(
        `
          INSERT INTO pending_snapshots (
            id,
            detectionId,
            filePath,
            fileSize,
            contentType,
            capturedAt,
            compressed,
            uploaded,
            retentionUntil,
            createdAt
          ) VALUES (
            @id,
            @detectionId,
            @filePath,
            @fileSize,
            @contentType,
            @capturedAt,
            @compressed,
            @uploaded,
            @retentionUntil,
            @createdAt
          )
          ON CONFLICT(id) DO UPDATE SET
            detectionId = excluded.detectionId,
            filePath = excluded.filePath,
            fileSize = excluded.fileSize,
            contentType = excluded.contentType,
            capturedAt = excluded.capturedAt,
            compressed = excluded.compressed,
            uploaded = excluded.uploaded,
            retentionUntil = excluded.retentionUntil,
            createdAt = excluded.createdAt
        `,
      )
      .run(snapshot);
  }

  public getUnsyncedSnapshots(limit: number): PendingSnapshot[] {
    return this.db
      .prepare(
        `
          SELECT *
          FROM pending_snapshots
          WHERE uploaded = 0
          ORDER BY createdAt ASC
          LIMIT ?
        `,
      )
      .all(limit) as PendingSnapshot[];
  }

  public markSnapshotUploaded(id: string): void {
    this.db
      .prepare(
        `
          UPDATE pending_snapshots
          SET uploaded = 1
          WHERE id = ?
        `,
      )
      .run(id);
  }

  public deleteExpiredSnapshots(now: string): PendingSnapshot[] {
    const selectStatement = this.db.prepare(
      `
        SELECT *
        FROM pending_snapshots
        WHERE retentionUntil <= ?
      `,
    );
    const deleteStatement = this.db.prepare(
      `
        DELETE FROM pending_snapshots
        WHERE retentionUntil <= ?
      `,
    );

    const transaction = this.db.transaction((cutoff: string) => {
      const expired = selectStatement.all(cutoff) as PendingSnapshot[];
      deleteStatement.run(cutoff);
      return expired;
    });

    return transaction(now);
  }

  public insertTelemetry(item: TelemetryBufferItem): void {
    this.db
      .prepare(
        `
          INSERT INTO telemetry_buffer (
            id,
            kind,
            payload,
            synced,
            syncedAt,
            createdAt
          ) VALUES (
            @id,
            @kind,
            @payload,
            @synced,
            @syncedAt,
            @createdAt
          )
          ON CONFLICT(id) DO UPDATE SET
            kind = excluded.kind,
            payload = excluded.payload,
            synced = excluded.synced,
            syncedAt = excluded.syncedAt,
            createdAt = excluded.createdAt
        `,
      )
      .run(item);
  }

  public getUnsyncedTelemetry(limit: number): TelemetryBufferItem[] {
    return this.db
      .prepare(
        `
          SELECT *
          FROM telemetry_buffer
          WHERE synced = 0
          ORDER BY createdAt ASC
          LIMIT ?
        `,
      )
      .all(limit) as TelemetryBufferItem[];
  }

  public markTelemetrySynced(id: string, syncedAt: string): void {
    this.db
      .prepare(
        `
          UPDATE telemetry_buffer
          SET synced = 1,
              syncedAt = ?
          WHERE id = ?
        `,
      )
      .run(syncedAt, id);
  }

  public upsertHealthSnapshot(snapshot: ComponentHealth): void {
    this.db
      .prepare(
        `
          INSERT INTO device_health_snapshots (
            component,
            status,
            message,
            lastCheckedAt
          ) VALUES (
            @component,
            @status,
            @message,
            @lastCheckedAt
          )
          ON CONFLICT(component) DO UPDATE SET
            status = excluded.status,
            message = excluded.message,
            lastCheckedAt = excluded.lastCheckedAt
        `,
      )
      .run(snapshot);
  }

  public getHealthSnapshots(): ComponentHealth[] {
    return this.db
      .prepare(
        `
          SELECT *
          FROM device_health_snapshots
          ORDER BY component ASC
        `,
      )
      .all() as ComponentHealth[];
  }

  public getSyncCursor(scope: SyncScope): LocalSyncState | null {
    const row = this.db
      .prepare(
        `
          SELECT *
          FROM sync_state
          WHERE scope = ?
        `,
      )
      .get(scope) as LocalSyncState | undefined;

    return row ?? null;
  }

  public setSyncCursor(
    scope: SyncScope,
    cursor: string,
    updatedAt = new Date().toISOString(),
  ): void {
    this.db
      .prepare(
        `
          INSERT INTO sync_state (
            scope,
            cursor,
            updatedAt
          ) VALUES (
            @scope,
            @cursor,
            @updatedAt
          )
          ON CONFLICT(scope) DO UPDATE SET
            cursor = excluded.cursor,
            updatedAt = excluded.updatedAt
        `,
      )
      .run({ scope, cursor, updatedAt });
  }

  public getDeviceToken(): string | null {
    const row = this.db
      .prepare(`SELECT cursor FROM sync_state WHERE scope = 'DEVICE_TOKEN'`)
      .get() as { cursor: string } | undefined;
    return row?.cursor ?? null;
  }

  public setDeviceToken(token: string): void {
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO sync_state (scope, cursor, updatedAt) VALUES ('DEVICE_TOKEN', @token, @updatedAt)
         ON CONFLICT(scope) DO UPDATE SET cursor = excluded.cursor, updatedAt = excluded.updatedAt`,
      )
      .run({ token, updatedAt });
  }

  private resolvePendingTable(
    table: "pending_detections" | "pending_match_events",
  ): string {
    if (table === "pending_detections") {
      return table;
    }

    return "pending_match_events";
  }

  private countRows(sql: string): number {
    const row = this.db.prepare(sql).get() as { count: number } | undefined;
    return row?.count ?? 0;
  }
}
