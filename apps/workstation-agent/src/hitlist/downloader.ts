import { CentralApiClient } from "../api/client.js";
import { DbClient } from "../db/client.js";
import { createLogger } from "../logger.js";
import type { HitlistEntry, LocalHitlistEntry } from "../types.js";

const logger = createLogger("hitlist-downloader");

interface HitlistCursorState {
  [hitlistId: string]: number;
}

export interface HitlistSyncSummary {
  synced: number;
  unchanged: number;
  errors: number;
}

export class HitlistDownloader {
  public constructor(
    private readonly api: CentralApiClient,
    private readonly db: DbClient,
  ) {}

  public async syncAll(hitlistIds: string[]): Promise<HitlistSyncSummary> {
    const summary: HitlistSyncSummary = {
      synced: 0,
      unchanged: 0,
      errors: 0,
    };
    const cursorState = this.readCursorState();

    for (const hitlistId of hitlistIds) {
      const sinceVersion = cursorState[hitlistId];

      try {
        const response = await this.api.getHitlist(hitlistId, sinceVersion);

        if (!response.changed) {
          cursorState[hitlistId] = response.currentVersionNumber;
          this.persistCursorState(cursorState);
          summary.unchanged += 1;
          logger.debug("hitlist unchanged", {
            hitlistId,
            sinceVersion,
            currentVersionNumber: response.currentVersionNumber,
          });
          continue;
        }

        if (!response.version) {
          summary.errors += 1;
          logger.error("hitlist sync response missing version payload", {
            hitlistId,
            currentVersionNumber: response.currentVersionNumber,
          });
          continue;
        }

        if (
          typeof sinceVersion === "number" &&
          response.version.versionNumber > sinceVersion + 1
        ) {
          logger.warn("hitlist version gap detected, full re-sync applied", {
            hitlistId,
            expectedVersion: sinceVersion + 1,
            receivedVersion: response.version.versionNumber,
          });
        }

        const syncedAt = new Date().toISOString();
        const removed = this.db.clearHitlistEntries(hitlistId);

        for (const entry of response.version.entries) {
          this.db.upsertHitlistEntry(this.toLocalHitlistEntry(hitlistId, entry, syncedAt));
        }

        cursorState[hitlistId] = response.currentVersionNumber;
        this.persistCursorState(cursorState);
        summary.synced += 1;

        logger.info("hitlist synced", {
          hitlistId,
          sinceVersion,
          currentVersionNumber: response.currentVersionNumber,
          removed,
          inserted: response.version.entries.length,
        });
      } catch (error) {
        summary.errors += 1;
        logger.error("hitlist sync failed", {
          hitlistId,
          sinceVersion,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return summary;
  }

  public async forceResync(hitlistIds: string[]): Promise<HitlistSyncSummary> {
    const cursorState = this.readCursorState();

    for (const hitlistId of hitlistIds) {
      delete cursorState[hitlistId];
      this.db.clearHitlistEntries(hitlistId);
    }

    this.persistCursorState(cursorState);
    logger.info("hitlist cursors cleared for force resync", {
      hitlistIds: hitlistIds.join(", "),
    });

    return this.syncAll(hitlistIds);
  }

  private readCursorState(): HitlistCursorState {
    const cursor = this.db.getSyncCursor("HITLIST");
    if (!cursor) {
      return {};
    }

    try {
      const parsed = JSON.parse(cursor.cursor) as unknown;
      if (!this.isHitlistCursorState(parsed)) {
        logger.warn("invalid hitlist cursor state, resetting", { cursor: cursor.cursor });
        return {};
      }

      return parsed;
    } catch (error) {
      logger.warn("failed to parse hitlist cursor state, resetting", {
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  private persistCursorState(cursorState: HitlistCursorState): void {
    this.db.setSyncCursor("HITLIST", JSON.stringify(cursorState));
  }

  private toLocalHitlistEntry(hitlistId: string, entry: HitlistEntry, syncedAt: string): LocalHitlistEntry {
    return {
      id: entry.id,
      hitlistId,
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
      metadata: JSON.stringify({
        hitlistVersionId: entry.hitlistVersionId,
        reasonCode: entry.reasonCode,
        caseReference: entry.caseReference,
        sourceAgency: entry.sourceAgency,
        tags: entry.tags,
        vehicleCategory: entry.vehicleCategory,
        ownerName: entry.ownerName,
        ownerContact: entry.ownerContact,
        extendedCaseNotes: entry.extendedCaseNotes,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      }),
      syncedAt,
    };
  }

  private isHitlistCursorState(value: unknown): value is HitlistCursorState {
    if (typeof value !== "object" || value === null) {
      return false;
    }

    return Object.values(value).every((version) => typeof version === "number" && Number.isFinite(version));
  }
}
