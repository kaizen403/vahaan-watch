import { Hono } from "hono";
import type { AppBindings } from "../types.js";
import { prisma } from "../lib/prisma.js";
import { computeEffectiveStatus } from "../utils/device-status.js";
import { fail, ok } from "../utils/json.js";
import { writeAuditLog } from "../lib/audit.js";

export const telemetryRoutes = new Hono<AppBindings>();

telemetryRoutes.post("/api/telemetry/heartbeat", async (c) => {
  const device = c.get("device");
  const body = await c.req.json();

  if (!device) {
    return fail(c, 401, "Device authentication required.");
  }

  const now = new Date();

  if (device.token.deviceType === "WORKSTATION" && device.token.workstationId) {
    await prisma.workstation.update({
      where: { id: device.token.workstationId },
      data: {
        lastSeenAt: now,
        status: body.status === "OFFLINE" ? "OFFLINE" : "ACTIVE",
      },
    });
  }

  if (device.token.deviceType === "TABLET" && device.token.tabletId) {
    await prisma.tablet.update({
      where: { id: device.token.tabletId },
      data: {
        lastSeenAt: now,
        status: body.status === "OFFLINE" ? "OFFLINE" : "ACTIVE",
      },
    });
  }

  const point = await prisma.telemetryPoint.create({
    data: {
      workstationId: device.token.workstationId,
      tabletId: device.token.tabletId,
      kind: "HEARTBEAT",
      payload: {
        reportedAt: now.toISOString(),
        ...body,
      },
    },
  });

  await writeAuditLog({
    actorDevice: device,
    action: "telemetry.heartbeat",
    entityType: "telemetry_point",
    entityId: point.id,
  });

  return ok(c, point, 201);
});

telemetryRoutes.get("/api/telemetry/device/:deviceId", async (c) => {
  const deviceId = c.req.param("deviceId");

  const workstation = await prisma.workstation.findUnique({ where: { deviceId } });
  const tablet = workstation ? null : await prisma.tablet.findUnique({ where: { deviceId } });

  if (!workstation && !tablet) {
    return fail(c, 404, "Device not found.");
  }

  const telemetry = await prisma.telemetryPoint.findMany({
    where: workstation
      ? { workstationId: workstation.id }
      : { tabletId: tablet!.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return ok(c, telemetry);
});

telemetryRoutes.get("/api/devices/:deviceId/health", async (c) => {
  const deviceId = c.req.param("deviceId");

  const workstation = await prisma.workstation.findUnique({
    where: { deviceId },
    select: {
      id: true,
      deviceId: true,
      name: true,
      status: true,
      lastSeenAt: true,
    },
  });

  if (!workstation) {
    return fail(c, 404, "Workstation not found.");
  }

  const telemetry = await prisma.telemetryPoint.findMany({
    where: {
      workstationId: workstation.id,
      kind: "HEARTBEAT",
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return ok(c, {
    status: computeEffectiveStatus(workstation.status, workstation.lastSeenAt),
    lastSeenAt: workstation.lastSeenAt,
    workstation: {
      ...workstation,
      status: computeEffectiveStatus(workstation.status, workstation.lastSeenAt),
    },
    telemetry,
  });
});
