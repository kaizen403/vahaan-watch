import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import type { AppBindings } from "../types.js";
import { prisma } from "../lib/prisma.js";
import { normalizePlate } from "../utils/plate.js";
import { fail, ok } from "../utils/json.js";
import { parseOptionalDateInput } from "../utils/date.js";
import { writeAuditLog } from "../lib/audit.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("portal-scan");

export const portalScanRoutes = new Hono<AppBindings>();

const PORTAL_SCANNER_DEVICE_ID = "portal-scanner";

async function resolveWorkstationId(workstationAddress?: string): Promise<string> {
  if (workstationAddress) {
    const ws = await prisma.workstation.findUnique({
      where: { address: workstationAddress },
      select: { id: true },
    });
    if (ws) return ws.id;
  }

  const portal = await prisma.workstation.upsert({
    where: { deviceId: PORTAL_SCANNER_DEVICE_ID },
    update: {},
    create: {
      deviceId: PORTAL_SCANNER_DEVICE_ID,
      address: PORTAL_SCANNER_DEVICE_ID,
      passwordHash: "",
      name: "Portal Scanner",
      description: "Virtual workstation for browser-based scanning",
      status: "ACTIVE",
    },
  });
  return portal.id;
}

portalScanRoutes.post("/api/portal/scan", async (c) => {
  const user = c.get("user");
  if (!user) return fail(c, 401, "Authentication required.");

  const body = await c.req.json();
  const plate = typeof body.plate === "string" ? body.plate.trim() : "";

  if (!plate) {
    return fail(c, 400, "plate is required.");
  }

  const occurredAt = parseOptionalDateInput(body.occurredAt);
  if (occurredAt === undefined) {
    return fail(c, 400, "occurredAt must be a valid ISO date string.");
  }

  const workstationAddress = typeof body.workstationAddress === "string" ? body.workstationAddress.trim() : undefined;
  const workstationId = await resolveWorkstationId(workstationAddress);
  const externalEventId = `portal-${randomUUID()}`;
  const now = new Date();
  const normalizedPlate = normalizePlate(plate);

  const detection = await prisma.detection.create({
    data: {
      externalEventId,
      workstationId,
      occurredAt: occurredAt ?? now,
      plate,
      country: typeof body.country === "string" ? body.country : null,
      make: typeof body.make === "string" ? body.make : null,
      model: typeof body.model === "string" ? body.model : null,
      color: typeof body.color === "string" ? body.color : null,
      category: typeof body.category === "string" ? body.category : null,
      confidence: typeof body.confidence === "number" ? body.confidence : null,
      rawPayload: body,
    },
  });

  await prisma.outboxJob.create({
    data: {
      topic: "detection.created",
      aggregateType: "detection",
      aggregateId: detection.id,
      payload: body,
    },
  });

  const matchingEntries = await prisma.hitlistEntry.findMany({
    where: {
      plateNormalized: normalizedPlate,
      status: "active",
      hitlistVersion: {
        hitlist: { status: "ACTIVE" },
      },
    },
    select: {
      id: true,
      plateOriginal: true,
      priority: true,
      reasonSummary: true,
      caseReference: true,
      sourceAgency: true,
    },
  });

  const matchEvents = [];

  for (const entry of matchingEntries) {
    const matchExternalId = `portal-match-${randomUUID()}`;

    const matchEvent = await prisma.matchEvent.create({
      data: {
        externalEventId: matchExternalId,
        detectionId: detection.id,
        workstationId,
        hitlistEntryId: entry.id,
        alertStatus: "PENDING",
      },
    });

    await prisma.outboxJob.create({
      data: {
        topic: "match-event.created",
        aggregateType: "match_event",
        aggregateId: matchEvent.id,
        payload: {
          externalEventId: matchExternalId,
          detectionId: detection.id,
          plate,
          hitlistEntryId: entry.id,
          priority: entry.priority,
          reasonSummary: entry.reasonSummary,
        },
      },
    });

    matchEvents.push({
      id: matchEvent.id,
      alertStatus: matchEvent.alertStatus,
      hitlistEntry: entry,
    });
  }

  await prisma.$executeRaw`SELECT pg_notify('outbox_new_job', 'trigger')`;

  await writeAuditLog({
    actorUser: user,
    action: "portal.scan.completed",
    entityType: "detection",
    entityId: detection.id,
    metadata: {
      plate,
      normalizedPlate,
      matchCount: matchEvents.length,
      isHit: matchEvents.length > 0,
    },
  });

  logger.info(
    { plate, normalizedPlate, matchCount: matchEvents.length, userId: user.id },
    "portal scan completed",
  );

  return ok(c, {
    detection: {
      id: detection.id,
      plate: detection.plate,
      country: detection.country,
      make: detection.make,
      model: detection.model,
      color: detection.color,
      category: detection.category,
      confidence: detection.confidence,
      occurredAt: detection.occurredAt,
    },
    matches: matchEvents,
    isHit: matchEvents.length > 0,
    matchCount: matchEvents.length,
  }, 201);
});
