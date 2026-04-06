import { prisma } from "./prisma.js";
import { createLogger } from "./logger.js";
import {
  sendToTabletIds,
  sendToWorkstationConnections,
} from "./tablet-sessions.js";

const logger = createLogger("outbox-processor");

const POLL_INTERVAL_MS = 2000;
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 10;
const BASE_RETRY_DELAY_MS = 5000;
const MAX_RETRY_DELAY_MS = 300_000;

let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function retryDelay(attempts: number): number {
  const delay = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, attempts), MAX_RETRY_DELAY_MS);
  const jitter = delay * 0.2 * Math.random();
  return Math.floor(delay + jitter);
}

async function processBatch(): Promise<number> {
  const now = new Date();

  // Query 1: Fetch all PENDING jobs
  const jobs = await prisma.outboxJob.findMany({
    where: {
      status: "PENDING",
      availableAt: { lte: now },
    },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  if (jobs.length === 0) return 0;

  const jobIds = jobs.map((j) => j.id);

  // Query 2: Mark all as PROCESSING in one shot
  await prisma.outboxJob.updateMany({
    where: { id: { in: jobIds } },
    data: { status: "PROCESSING" },
  });

  // Query 3: Batch fetch all matchEvents (for match-event.created jobs)
  const matchEventAggregateIds = jobs
    .filter((j) => j.topic === "match-event.created")
    .map((j) => j.aggregateId);
  const matchEventsById = new Map(
    (matchEventAggregateIds.length > 0
      ? await prisma.matchEvent.findMany({
          where: { id: { in: matchEventAggregateIds } },
          include: {
            detection: {
              select: { plate: true, country: true, occurredAt: true, snapshotUrl: true },
            },
            hitlistEntry: {
              select: { plateOriginal: true, reasonSummary: true, priority: true },
            },
            workstation: {
              select: { deviceId: true },
            },
          },
        })
      : []
    ).map((me) => [me.id, me] as const),
  );

  // Query 4: Batch fetch all detections (for detection.created jobs)
  const detectionAggregateIds = jobs
    .filter((j) => j.topic === "detection.created")
    .map((j) => j.aggregateId);
  const detectionsById = new Map(
    (detectionAggregateIds.length > 0
      ? await prisma.detection.findMany({
          where: { id: { in: detectionAggregateIds } },
          select: {
            id: true,
            workstationId: true,
            plate: true,
            confidence: true,
            occurredAt: true,
            snapshotUrl: true,
            createdAt: true,
          },
        })
      : []
    ).map((d) => [d.id, d] as const),
  );

  // Query 5: Batch fetch all device pairings for relevant workstations
  const allWorkstationIds = [
    ...[...matchEventsById.values()].map((me) => me.workstationId),
    ...[...detectionsById.values()].map((d) => d.workstationId),
  ];
  const uniqueWsIds = [...new Set(allWorkstationIds)];
  const pairingsByWsId = new Map<string, string[]>();
  if (uniqueWsIds.length > 0) {
    const pairings = await prisma.devicePairing.findMany({
      where: { workstationId: { in: uniqueWsIds }, unpairedAt: null },
      select: { workstationId: true, tabletId: true },
    });
    for (const p of pairings) {
      if (!pairingsByWsId.has(p.workstationId)) pairingsByWsId.set(p.workstationId, []);
      pairingsByWsId.get(p.workstationId)!.push(p.tabletId);
    }
  }

  // Concurrent SSE delivery with per-job error handling
  const sentIds: string[] = [];
  const failedJobs: Array<{ id: string; attempts: number }> = [];

  await Promise.allSettled(
    jobs.map(async (job) => {
      try {
        if (job.topic === "match-event.created") {
          const matchEvent = matchEventsById.get(job.aggregateId);
          if (matchEvent) {
            const pairedTabletIds = pairingsByWsId.get(matchEvent.workstationId) ?? [];
            const eventData = JSON.stringify({
              type: "match-event",
              id: matchEvent.id,
              workstationId: matchEvent.workstationId,
              alertStatus: matchEvent.alertStatus,
              detection: matchEvent.detection,
              hitlistEntry: matchEvent.hitlistEntry,
              createdAt: matchEvent.createdAt.toISOString(),
            });
            sendToWorkstationConnections(matchEvent.workstationId, "match-event", eventData);
            sendToTabletIds(pairedTabletIds, "match-event", eventData);
            logger.debug({ jobId: job.id, matchEventId: matchEvent.id }, "match event dispatched");
          } else {
            logger.warn({ jobId: job.id, aggregateId: job.aggregateId }, "match event missing for outbox job");
          }
        } else if (job.topic === "detection.created") {
          const detection = detectionsById.get(job.aggregateId);
          if (detection) {
            const eventData = JSON.stringify({
              type: "detection-created",
              id: detection.id,
              workstationId: detection.workstationId,
              plate: detection.plate,
              confidence: detection.confidence,
              occurredAt: detection.occurredAt,
              snapshotUrl: detection.snapshotUrl,
              createdAt: detection.createdAt.toISOString(),
            });
            sendToWorkstationConnections(detection.workstationId, "detection-created", eventData);
            logger.debug({ jobId: job.id, detectionId: detection.id }, "detection event dispatched");
          } else {
            logger.warn({ jobId: job.id, aggregateId: job.aggregateId }, "detection missing for outbox job");
          }
        }
        sentIds.push(job.id);
      } catch (err) {
        logger.error({ jobId: job.id, err }, "outbox job processing error");
        failedJobs.push({ id: job.id, attempts: job.attempts });
      }
    }),
  );

  // Query 6: Batch mark SENT
  if (sentIds.length > 0) {
    await prisma.outboxJob.updateMany({
      where: { id: { in: sentIds } },
      data: { status: "SENT", attempts: { increment: 1 } },
    });
  }

  // Per-job error updates (individual queries for failed jobs only)
  for (const { id, attempts } of failedJobs) {
    const nextAttempts = attempts + 1;
    const nextAvailable = new Date(Date.now() + retryDelay(nextAttempts));
    await prisma.outboxJob.update({
      where: { id },
      data: {
        status: nextAttempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
        attempts: nextAttempts,
        availableAt: nextAvailable,
      },
    });
  }

  return sentIds.length;
}

async function poll(): Promise<void> {
  if (!running) return;

  try {
    const processed = await processBatch();
    if (processed > 0) {
      logger.debug({ processed }, "outbox batch processed");
    }
  } catch (err) {
    logger.error({ err }, "outbox poll cycle failed");
  }

  if (running) {
    timer = setTimeout(poll, POLL_INTERVAL_MS);
  }
}

export async function startOutboxProcessor(): Promise<void> {
  if (running) return;
  running = true;

  // Reset any jobs stuck in PROCESSING from a previous crash
  await prisma.outboxJob.updateMany({
    where: { status: "PROCESSING" },
    data: { status: "PENDING", availableAt: new Date() },
  });
  logger.info("stale PROCESSING jobs reset to PENDING");

  logger.info({ pollIntervalMs: POLL_INTERVAL_MS, batchSize: BATCH_SIZE }, "outbox processor started");
  void poll();
}

export function stopOutboxProcessor(): void {
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  logger.info("outbox processor stopped");
}
