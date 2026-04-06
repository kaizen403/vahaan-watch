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

async function getActivePairedTabletIds(workstationId: string): Promise<string[]> {
  const pairings = await prisma.devicePairing.findMany({
    where: {
      workstationId,
      unpairedAt: null,
    },
    select: {
      tabletId: true,
    },
  });

  return pairings.map((pairing) => pairing.tabletId);
}

async function processBatch(): Promise<number> {
  const now = new Date();

  const jobs = await prisma.outboxJob.findMany({
    where: {
      status: "PENDING",
      availableAt: { lte: now },
    },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  if (jobs.length === 0) return 0;

  let processed = 0;

  for (const job of jobs) {
    await prisma.outboxJob.update({
      where: { id: job.id },
      data: { status: "PROCESSING" },
    });

    try {
      if (job.topic === "match-event.created") {
        const matchEvent = await prisma.matchEvent.findUnique({
          where: { id: job.aggregateId },
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
        });

        if (matchEvent) {
          const pairedTabletIds = await getActivePairedTabletIds(
            matchEvent.workstationId,
          );
          const eventData = JSON.stringify({
            type: "match-event",
            id: matchEvent.id,
            workstationId: matchEvent.workstationId,
            alertStatus: matchEvent.alertStatus,
            detection: matchEvent.detection,
            hitlistEntry: matchEvent.hitlistEntry,
            createdAt: matchEvent.createdAt.toISOString(),
          });

          const deliveredToWorkstation = sendToWorkstationConnections(
            matchEvent.workstationId,
            "match-event",
            eventData,
          );
          const deliveredToTablets = sendToTabletIds(
            pairedTabletIds,
            "match-event",
            eventData,
          );

          logger.debug({
            jobId: job.id,
            matchEventId: matchEvent.id,
            workstationId: matchEvent.workstationId,
            pairedTabletCount: pairedTabletIds.length,
            deliveredToWorkstation,
            deliveredToTablets,
          }, "match event dispatched");
        } else {
          logger.warn({ jobId: job.id, aggregateId: job.aggregateId }, "match event missing for outbox job");
        }
      } else if (job.topic === "detection.created") {
        const detection = await prisma.detection.findUnique({
          where: { id: job.aggregateId },
          select: {
            id: true,
            workstationId: true,
            plate: true,
            confidence: true,
            occurredAt: true,
            snapshotUrl: true,
            createdAt: true,
          },
        });

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

          sendToWorkstationConnections(
            detection.workstationId,
            "detection-created",
            eventData,
          );

          logger.debug({ jobId: job.id, detectionId: detection.id }, "detection event dispatched");
        } else {
          logger.warn({ jobId: job.id, aggregateId: job.aggregateId }, "detection missing for outbox job");
        }
      }

      await prisma.outboxJob.update({
        where: { id: job.id },
        data: {
          status: "SENT",
          attempts: job.attempts + 1,
        },
      });

      processed++;
    } catch (err) {
      logger.error({ jobId: job.id, err }, "outbox job processing error");
      const nextAttempts = job.attempts + 1;
      const nextAvailable = new Date(Date.now() + retryDelay(nextAttempts));
      await prisma.outboxJob.update({
        where: { id: job.id },
        data: {
          status: nextAttempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
          attempts: nextAttempts,
          availableAt: nextAvailable,
        },
      });
    }
  }

  return processed;
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
