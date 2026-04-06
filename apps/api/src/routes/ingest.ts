import { Hono } from "hono";
import type { AppBindings } from "../types.js";
import { prisma } from "../lib/prisma.js";
import { fail, ok } from "../utils/json.js";
import { parseOptionalDateInput } from "../utils/date.js";
import { writeAuditLog } from "../lib/audit.js";

export const ingestRoutes = new Hono<AppBindings>();

ingestRoutes.post("/api/ingest/detections", async (c) => {
  const device = c.get("device");
  const body = await c.req.json();
  const externalEventId = typeof body.externalEventId === "string" ? body.externalEventId : "";
  const plate = typeof body.plate === "string" ? body.plate.trim() : "";
  const occurredAt = parseOptionalDateInput(body.occurredAt);

  if (!device?.token.workstationId) {
    return fail(c, 400, "Detection ingest requires a workstation token.");
  }

  if (!externalEventId || !plate || occurredAt === null) {
    return fail(c, 400, "externalEventId, plate, and occurredAt are required.");
  }

  if (occurredAt === undefined) {
    return fail(c, 400, "occurredAt must be a valid ISO date string.");
  }

  const existing = await prisma.detection.findUnique({ where: { externalEventId } });
  if (existing) {
    return ok(c, existing);
  }

  const detection = await prisma.detection.create({
    data: {
      externalEventId,
      workstationId: device.token.workstationId,
      hitlistId: typeof body.hitlistId === "string" ? body.hitlistId : null,
      occurredAt,
      plate,
      country: typeof body.country === "string" ? body.country : null,
      make: typeof body.make === "string" ? body.make : null,
      model: typeof body.model === "string" ? body.model : null,
      color: typeof body.color === "string" ? body.color : null,
      category: typeof body.category === "string" ? body.category : null,
      confidence: typeof body.confidence === "number" ? body.confidence : null,
      snapshotUrl: typeof body.snapshotUrl === "string" ? body.snapshotUrl : null,
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
  await prisma.$executeRaw`SELECT pg_notify('outbox_new_job', 'trigger')`;

  await writeAuditLog({
    actorDevice: device,
    action: "detection.ingested",
    entityType: "detection",
    entityId: detection.id,
    metadata: { externalEventId, plate },
  });

  return ok(c, detection, 201);
});

ingestRoutes.post("/api/ingest/match-events", async (c) => {
  const device = c.get("device");
  const body = await c.req.json();
  const externalEventId = typeof body.externalEventId === "string" ? body.externalEventId : "";

  if (!device?.token.workstationId) {
    return fail(c, 400, "Match ingest requires a workstation token.");
  }

  if (!externalEventId) {
    return fail(c, 400, "externalEventId is required.");
  }

  const existing = await prisma.matchEvent.findUnique({ where: { externalEventId } });
  if (existing) {
    return ok(c, existing);
  }

  const matchEvent = await prisma.matchEvent.create({
    data: {
      externalEventId,
      detectionId: typeof body.detectionId === "string" ? body.detectionId : null,
      workstationId: device.token.workstationId,
      hitlistEntryId: typeof body.hitlistEntryId === "string" ? body.hitlistEntryId : null,
      alertStatus:
        body.alertStatus === "ACKNOWLEDGED" ||
        body.alertStatus === "ESCALATED" ||
        body.alertStatus === "FALSE_POSITIVE" ||
        body.alertStatus === "RESOLVED"
          ? body.alertStatus
          : "PENDING",
      note: typeof body.note === "string" ? body.note : null,
    },
  });

  await prisma.outboxJob.create({
    data: {
      topic: "match-event.created",
      aggregateType: "match_event",
      aggregateId: matchEvent.id,
      payload: body,
    },
  });
  await prisma.$executeRaw`SELECT pg_notify('outbox_new_job', 'trigger')`;

  await writeAuditLog({
    actorDevice: device,
    action: "match-event.ingested",
    entityType: "match_event",
    entityId: matchEvent.id,
    metadata: { externalEventId },
  });

  return ok(c, matchEvent, 201);
});
