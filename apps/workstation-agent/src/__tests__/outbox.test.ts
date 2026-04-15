import { describe, expect, it, vi } from "vitest";
import { OutboxFlusher } from "../sync/outbox.js";
import type { CentralApiClient } from "../api/client.js";
import type { DbClient } from "../db/client.js";
import type { PendingDetection, PendingMatchEvent } from "../types.js";

function createDetection(id: string): PendingDetection {
  return {
    id,
    externalEventId: `external-${id}`,
    plate: `TEST-${id}`,
    plateNormalized: `TEST${id}`,
    occurredAt: "2026-04-06T10:00:00.000Z",
    confidence: 0.9,
    snapshotPath: null,
    hitlistId: null,
    country: null,
    make: null,
    model: null,
    color: null,
    category: null,
    synced: 0,
    syncedAt: null,
    createdAt: "2026-04-06T10:00:00.000Z",
  };
}

function createMatchEvent(id: string): PendingMatchEvent {
  return {
    id,
    externalEventId: `external-${id}`,
    detectionId: null,
    hitlistEntryId: "entry-1",
    alertStatus: "PENDING",
    note: "test note",
    synced: 0,
    syncedAt: null,
    createdAt: "2026-04-06T10:00:00.000Z",
  };
}

describe("OutboxFlusher", () => {
  it("uses an independent detection batch size during flush", async () => {
    const matchEvents = [createMatchEvent("match-1")];
    const detections = [createDetection("det-1"), createDetection("det-2")];
    const getRetryableMatchEvents = vi.fn(() => matchEvents);
    const getRetryableDetections = vi.fn(() => detections);
    const markMatchEventSynced = vi.fn();
    const markDetectionSynced = vi.fn();
    const recordSyncAttempt = vi.fn();

    const db = {
      getRetryableMatchEvents,
      getRetryableDetections,
      markMatchEventSynced,
      markDetectionSynced,
      recordSyncAttempt,
    } as unknown as DbClient;

    const uploadMatchEvent = vi.fn().mockResolvedValue({ id: "server-match-1" });
    const uploadDetection = vi.fn().mockResolvedValue({ id: "server-det-1" });
    const api = {
      uploadMatchEvent,
      uploadDetection,
    } as unknown as CentralApiClient;

    const flusher = new OutboxFlusher(api, db);
    const summary = await flusher.flush(1, 2);

    expect(getRetryableMatchEvents).toHaveBeenCalledWith(1, expect.any(String));
    expect(getRetryableDetections).toHaveBeenCalledWith(2, expect.any(String));
    expect(uploadMatchEvent).toHaveBeenCalledTimes(1);
    expect(uploadDetection).toHaveBeenCalledTimes(2);
    expect(markMatchEventSynced).toHaveBeenCalledTimes(1);
    expect(markDetectionSynced).toHaveBeenCalledTimes(2);
    expect(recordSyncAttempt).not.toHaveBeenCalled();
    expect(summary).toMatchObject({
      matchEventsSynced: 1,
      detectionsSynced: 2,
      errors: 0,
    });
  });
});
