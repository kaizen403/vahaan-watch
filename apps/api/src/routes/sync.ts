import { Hono } from "hono";
import type { AppBindings } from "../types.js";
import { prisma } from "../lib/prisma.js";
import { fail, ok } from "../utils/json.js";
import { writeAuditLog } from "../lib/audit.js";

export const syncRoutes = new Hono<AppBindings>();

syncRoutes.get("/api/sync/contracts", (c) =>
  ok(c, {
    version: "phase1.v1",
    endpoints: {
      deviceRegistration: "/api/devices/register",
      heartbeat: "/api/telemetry/heartbeat",
      detectionIngest: "/api/ingest/detections",
      matchEventIngest: "/api/ingest/match-events",
      hitlistSnapshot: "/api/sync/hitlists/:hitlistId",
      syncCursor: "/api/sync/cursors",
    },
  }),
);

syncRoutes.get("/api/sync/hitlists", async (c) => {
  const device = c.get("device");
  if (!device) {
    return fail(c, 401, "Device authentication required.");
  }

  const workstationId = device.token.workstationId;
  if (!workstationId) {
    return fail(c, 400, "Only workstation devices can sync hitlists.");
  }

  const assignments = await prisma.hitlistAssignment.findMany({
    where: { workstationId },
    include: { hitlist: true },
  });

  return ok(c, {
    hitlists: assignments.map((a) => ({
      hitlistId: a.hitlistId,
      name: a.hitlist.name,
      status: a.hitlist.status,
      currentVersionNumber: a.hitlist.currentVersionNumber,
    })),
  });
});

syncRoutes.get("/api/sync/hitlists/:hitlistId", async (c) => {
  const hitlistId = c.req.param("hitlistId");
  const sinceVersion = Number(c.req.query("sinceVersion") ?? "0");

  const hitlist = await prisma.hitlist.findUnique({
    where: { id: hitlistId },
    include: {
      versions: {
        where: {
          versionNumber: {
            equals: sinceVersion < 0 ? 0 : undefined,
          },
        },
      },
    },
  });

  if (!hitlist) {
    return fail(c, 404, "Hitlist not found.");
  }

  if (sinceVersion >= hitlist.currentVersionNumber) {
    return ok(c, {
      hitlistId,
      currentVersionNumber: hitlist.currentVersionNumber,
      changed: false,
      entries: [],
    });
  }

  const currentVersion = await prisma.hitlistVersion.findFirst({
    where: {
      hitlistId,
      versionNumber: hitlist.currentVersionNumber,
    },
    include: {
      entries: true,
    },
  });

  return ok(c, {
    hitlistId,
    currentVersionNumber: hitlist.currentVersionNumber,
    changed: true,
    version: currentVersion,
  });
});

syncRoutes.post("/api/sync/cursors", async (c) => {
  const device = c.get("device");
  if (!device) {
    return fail(c, 401, "Device authentication required.");
  }

  const body = await c.req.json();
  const scope =
    body.scope === "DETECTIONS" ||
    body.scope === "MATCH_EVENTS" ||
    body.scope === "TELEMETRY"
      ? body.scope
      : "HITLIST";
  const cursor = typeof body.cursor === "string" ? body.cursor : "";

  if (!cursor) {
    return fail(c, 400, "cursor is required.");
  }

  const record = await prisma.syncCursor.upsert({
    where: {
      deviceType_deviceKey_scope: {
        deviceType: device.token.deviceType,
        deviceKey: device.deviceKey,
        scope,
      },
    },
    update: { cursor },
    create: {
      deviceType: device.token.deviceType,
      deviceKey: device.deviceKey,
      scope,
      cursor,
    },
  });

  await writeAuditLog({
    actorDevice: device,
    action: "sync.cursor.updated",
    entityType: "sync_cursor",
    entityId: record.id,
    metadata: { scope, cursor },
  });

  return ok(c, record, 201);
});

syncRoutes.get("/api/sync/cursors", async (c) => {
  const device = c.get("device");
  if (!device) {
    return fail(c, 401, "Device authentication required.");
  }

  const cursors = await prisma.syncCursor.findMany({
    where: {
      deviceType: device.token.deviceType,
      deviceKey: device.deviceKey,
    },
    orderBy: { updatedAt: "desc" },
  });

  return ok(c, cursors);
});
