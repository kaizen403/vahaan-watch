import { prisma } from "./prisma.js";
import { createLogger } from "./logger.js";
import { broadcastToTablets, sendToWorkstationTablets, getConnectedTabletCount } from "./tablet-sessions.js";

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
      let delivered = 0;

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
          const eventData = JSON.stringify({
            type: "match-event",
            id: matchEvent.id,
            workstationId: matchEvent.workstationId,
            alertStatus: matchEvent.alertStatus,
            detection: matchEvent.detection,
            hitlistEntry: matchEvent.hitlistEntry,
            createdAt: matchEvent.createdAt.toISOString(),
          });

          delivered = sendToWorkstationTablets(matchEvent.workstationId, "match-event", eventData);

          if (delivered === 0 && getConnectedTabletCount() > 0) {
            delivered = broadcastToTablets("match-event", eventData);
          }
        }
      } else if (job.topic === "detection.created") {
        delivered = 0;
      }

      if (delivered > 0 || getConnectedTabletCount() === 0) {
        await prisma.outboxJob.update({
          where: { id: job.id },
          data: {
            status: "SENT",
            attempts: job.attempts + 1,
          },
        });
      } else {
        const nextAttempts = job.attempts + 1;
        if (nextAttempts >= MAX_ATTEMPTS) {
          await prisma.outboxJob.update({
            where: { id: job.id },
            data: { status: "FAILED", attempts: nextAttempts },
          });
          logger.warn({ jobId: job.id, topic: job.topic }, "outbox job dead-lettered");
        } else {
          const nextAvailable = new Date(Date.now() + retryDelay(nextAttempts));
          await prisma.outboxJob.update({
            where: { id: job.id },
            data: {
              status: "PENDING",
              attempts: nextAttempts,
              availableAt: nextAvailable,
            },
          });
        }
      }

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

export function startOutboxProcessor(): void {
  if (running) return;
  running = true;
  logger.info({ pollIntervalMs: POLL_INTERVAL_MS, batchSize: BATCH_SIZE }, "outbox processor started");
  poll();
}

export function stopOutboxProcessor(): void {
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  logger.info("outbox processor stopped");
}
