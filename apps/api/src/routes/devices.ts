import { Hono } from "hono";
import type { AppBindings } from "../types.js";
import { prisma } from "../lib/prisma.js";
import { config } from "../lib/env.js";
import { issueDeviceToken } from "../utils/crypto.js";
import { computeEffectiveStatus } from "../utils/device-status.js";
import { fail, ok } from "../utils/json.js";
import { writeAuditLog } from "../lib/audit.js";

export const deviceRoutes = new Hono<AppBindings>();

deviceRoutes.post("/api/devices/register", async (c) => {
  const provisioningToken = c.req.header("x-provisioning-token");
  if (provisioningToken !== config.deviceProvisioningToken) {
    return fail(c, 401, "Provisioning token is invalid.");
  }

  const body = await c.req.json();
  const deviceType = body.deviceType === "TABLET" ? "TABLET" : body.deviceType === "WORKSTATION" ? "WORKSTATION" : null;
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : null;

  if (!deviceType || !deviceId || !name) {
    return fail(c, 400, "deviceType, deviceId, and name are required.");
  }

  if (deviceType === "WORKSTATION") {
    const existing = await prisma.workstation.findUnique({ where: { deviceId } });
    if (existing) {
      const issued = issueDeviceToken();
      await prisma.deviceToken.updateMany({
        where: { workstationId: existing.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await prisma.deviceToken.create({
        data: {
          tokenHash: issued.tokenHash,
          label: "re-bootstrap",
          deviceType: "WORKSTATION",
          workstationId: existing.id,
        },
      });
      await prisma.workstation.update({
        where: { id: existing.id },
        data: { status: "ACTIVE" },
      });

      await writeAuditLog({
        action: "device.re-registered",
        entityType: "workstation",
        entityId: existing.id,
        metadata: { deviceId, deviceType },
      });

      return ok(c, {
        deviceType,
        device: existing,
        deviceToken: issued.rawToken,
      }, 200);
    }

    const issued = issueDeviceToken();
    const workstation = await prisma.workstation.create({
      data: {
        deviceId,
        address: deviceId,
        passwordHash: "",
        name,
        description,
        status: "ACTIVE",
        tokens: {
          create: {
            tokenHash: issued.tokenHash,
            label: "bootstrap",
            deviceType: "WORKSTATION",
          },
        },
      },
      include: { tokens: true },
    });

    await writeAuditLog({
      action: "device.registered",
      entityType: "workstation",
      entityId: workstation.id,
      metadata: { deviceId, deviceType },
    });

    return ok(c, {
      deviceType,
      device: workstation,
      deviceToken: issued.rawToken,
    }, 201);
  }

  const existing = await prisma.tablet.findUnique({ where: { deviceId } });
  if (existing) {
    const issued = issueDeviceToken();
    await prisma.deviceToken.updateMany({
      where: { tabletId: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await prisma.deviceToken.create({
      data: {
        tokenHash: issued.tokenHash,
        label: "re-bootstrap",
        deviceType: "TABLET",
        tabletId: existing.id,
      },
    });
    await prisma.tablet.update({
      where: { id: existing.id },
      data: { status: "ACTIVE", lastSeenAt: new Date() },
    });

    await writeAuditLog({
      action: "device.re-registered",
      entityType: "tablet",
      entityId: existing.id,
      metadata: { deviceId, deviceType },
    });

    return ok(c, {
      deviceType,
      device: existing,
      deviceToken: issued.rawToken,
    }, 200);
  }

  const issued = issueDeviceToken();
  const tablet = await prisma.tablet.create({
    data: {
      deviceId,
      name,
      description,
      status: "ACTIVE",
      tokens: {
        create: {
          tokenHash: issued.tokenHash,
          label: "bootstrap",
          deviceType: "TABLET",
        },
      },
    },
    include: { tokens: true },
  });

  await writeAuditLog({
    action: "device.registered",
    entityType: "tablet",
    entityId: tablet.id,
    metadata: { deviceId, deviceType },
  });

  return ok(c, {
    deviceType,
    device: tablet,
    deviceToken: issued.rawToken,
  }, 201);
});

deviceRoutes.get("/api/devices", async (c) => {
  const [rawWorkstations, rawTablets, pairings] = await Promise.all([
    prisma.workstation.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.tablet.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.devicePairing.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  const now = Date.now();
  const workstations = rawWorkstations.map((ws) => ({
    ...ws,
    status: computeEffectiveStatus(ws.status, ws.lastSeenAt, now),
  }));
  const tablets = rawTablets.map((t) => ({
    ...t,
    status: computeEffectiveStatus(t.status, t.lastSeenAt, now),
  }));

  return ok(c, { workstations, tablets, pairings });
});

deviceRoutes.post("/api/devices/pairings", async (c) => {
  const body = await c.req.json();
  const workstationId = typeof body.workstationId === "string" ? body.workstationId : "";
  const tabletId = typeof body.tabletId === "string" ? body.tabletId : "";

  if (!workstationId || !tabletId) {
    return fail(c, 400, "workstationId and tabletId are required.");
  }

  const pairing = await prisma.devicePairing.create({
    data: {
      workstationId,
      tabletId,
    },
  });

  await writeAuditLog({
    actorUser: c.get("user"),
    action: "device.paired",
    entityType: "device_pairing",
    entityId: pairing.id,
    metadata: { workstationId, tabletId },
  });

  return ok(c, pairing, 201);
});

deviceRoutes.post("/api/devices/:deviceId/rotate-token", async (c) => {
  const user = c.get("user");
  const deviceId = c.req.param("deviceId");

  const workstation = await prisma.workstation.findUnique({
    where: { deviceId },
    include: { tokens: { where: { revokedAt: null }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const tablet = workstation ? null : await prisma.tablet.findUnique({
    where: { deviceId },
    include: { tokens: { where: { revokedAt: null }, orderBy: { createdAt: "desc" }, take: 1 } },
  });

  if (!workstation && !tablet) {
    return fail(c, 404, "Device not found.");
  }

  const now = new Date();
  const issued = issueDeviceToken();

  if (workstation) {
    await prisma.deviceToken.updateMany({
      where: { workstationId: workstation.id, revokedAt: null },
      data: { revokedAt: now },
    });
    await prisma.deviceToken.create({
      data: {
        tokenHash: issued.tokenHash,
        label: "rotated",
        deviceType: "WORKSTATION",
        workstationId: workstation.id,
      },
    });
    await writeAuditLog({
      actorUser: user,
      action: "device.token.rotated",
      entityType: "workstation",
      entityId: workstation.id,
      metadata: { deviceId },
    });
    return ok(c, { deviceType: "WORKSTATION", deviceToken: issued.rawToken });
  }

  await prisma.deviceToken.updateMany({
    where: { tabletId: tablet!.id, revokedAt: null },
    data: { revokedAt: now },
  });
  await prisma.deviceToken.create({
    data: {
      tokenHash: issued.tokenHash,
      label: "rotated",
      deviceType: "TABLET",
      tabletId: tablet!.id,
    },
  });
  await writeAuditLog({
    actorUser: user,
    action: "device.token.rotated",
    entityType: "tablet",
    entityId: tablet!.id,
    metadata: { deviceId },
  });
  return ok(c, { deviceType: "TABLET", deviceToken: issued.rawToken });
});
