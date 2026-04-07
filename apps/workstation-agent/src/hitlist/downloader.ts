import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
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
        const entries = response.version.entries.map(e => this.toLocalHitlistEntry(hitlistId, e, syncedAt));
        const inserted = this.db.replaceHitlistEntries(hitlistId, entries, syncedAt);

        cursorState[hitlistId] = response.currentVersionNumber;
        this.persistCursorState(cursorState);
        summary.synced += 1;

        try {
          const snapshotDir = resolve(process.cwd(), "data", "hitlist-snapshots");
          mkdirSync(snapshotDir, { recursive: true });
          const snapshotPath = resolve(snapshotDir, `${hitlistId}.json`);
          writeFileSync(snapshotPath, JSON.stringify({
            hitlistId,
            versionNumber: response.currentVersionNumber,
            entries: response.version.entries,
            savedAt: new Date().toISOString(),
          }), "utf-8");
        } catch (snapErr) {
          logger.warn("hitlist snapshot write failed (non-fatal)", { hitlistId, error: snapErr instanceof Error ? snapErr.message : String(snapErr) });
        }

        logger.info("hitlist synced", {
          hitlistId,
          sinceVersion,
          currentVersionNumber: response.currentVersionNumber,
          inserted,
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
