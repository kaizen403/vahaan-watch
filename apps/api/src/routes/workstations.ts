import { Hono } from "hono";
import bcrypt from "bcryptjs";
import type { AppBindings } from "../types.js";
import { prisma } from "../lib/prisma.js";
import { issueDeviceToken } from "../utils/crypto.js";
import { computeEffectiveStatus } from "../utils/device-status.js";
import { fail, ok } from "../utils/json.js";
import { writeAuditLog } from "../lib/audit.js";

export const workstationRoutes = new Hono<AppBindings>();

workstationRoutes.post("/api/workstations", async (c) => {
  const body = await c.req.json();
  const address = typeof body.address === "string" ? body.address.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : null;

  if (!address) return fail(c, 400, "address is required.");
  if (!password || password.length < 4)
    return fail(c, 400, "password is required (min 4 chars).");
  if (!name) return fail(c, 400, "name is required.");

  const existing = await prisma.workstation.findUnique({ where: { address } });
  if (existing)
    return fail(c, 409, "A workstation with this address already exists.");

  const passwordHash = await bcrypt.hash(password, 10);
  const issued = issueDeviceToken();

  const workstation = await prisma.workstation.create({
    data: {
      deviceId: address,
      address,
      passwordHash,
      name,
      description,
      status: "PENDING",
      tokens: {
        create: {
          tokenHash: issued.tokenHash,
          label: "bootstrap",
          deviceType: "WORKSTATION",
        },
      },
    },
  });

  await writeAuditLog({
    actorUser: c.get("user"),
    action: "workstation.created",
    entityType: "workstation",
    entityId: workstation.id,
    metadata: { address },
  });

  return ok(
    c,
    {
      id: workstation.id,
      address: workstation.address,
      name: workstation.name,
      description: workstation.description,
      status: workstation.status,
      deviceToken: issued.rawToken,
    },
    201,
  );
});

workstationRoutes.get("/api/workstations", async (c) => {
  const workstations = await prisma.workstation.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { pairings: true } },
    },
  });

  const now = Date.now();

  const result = workstations.map((ws) => {
    const effectiveStatus = computeEffectiveStatus(ws.status, ws.lastSeenAt, now);

    return {
      id: ws.id,
      deviceId: ws.deviceId,
      address: ws.address,
      name: ws.name,
      description: ws.description,
      status: effectiveStatus,
      registeredAt: ws.registeredAt,
      lastSeenAt: ws.lastSeenAt,
      createdAt: ws.createdAt,
      updatedAt: ws.updatedAt,
      connectedTablets: ws._count.pairings,
    };
  });

  return ok(c, result);
});

workstationRoutes.put("/api/workstations/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  const ws = await prisma.workstation.findUnique({ where: { id } });
  if (!ws) return fail(c, 404, "Workstation not found.");

  const data: Record<string, unknown> = {};

  if (typeof body.name === "string" && body.name.trim()) {
    data.name = body.name.trim();
  }
  if (typeof body.description === "string") {
    data.description = body.description.trim() || null;
  }
  if (typeof body.password === "string" && body.password.length >= 4) {
    data.passwordHash = await bcrypt.hash(body.password, 10);
  }
  if (typeof body.address === "string" && body.address.trim()) {
    const newAddress = body.address.trim();
    if (newAddress !== ws.address) {
      const conflict = await prisma.workstation.findUnique({
        where: { address: newAddress },
      });
      if (conflict)
        return fail(c, 409, "A workstation with this address already exists.");
      data.address = newAddress;
      data.deviceId = newAddress;
    }
  }

  const updated = await prisma.workstation.update({ where: { id }, data });

  await writeAuditLog({
    actorUser: c.get("user"),
    action: "workstation.updated",
    entityType: "workstation",
    entityId: id,
    metadata: { fields: Object.keys(data) },
  });

  return ok(c, {
    id: updated.id,
    deviceId: updated.deviceId,
    address: updated.address,
    name: updated.name,
    description: updated.description,
    status: updated.status,
    registeredAt: updated.registeredAt,
    lastSeenAt: updated.lastSeenAt,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  });
});

workstationRoutes.delete("/api/workstations/:id", async (c) => {
  const id = c.req.param("id");

  const ws = await prisma.workstation.findUnique({ where: { id } });
  if (!ws) return fail(c, 404, "Workstation not found.");

  await prisma.workstation.delete({ where: { id } });

  await writeAuditLog({
    actorUser: c.get("user"),
    action: "workstation.deleted",
    entityType: "workstation",
    entityId: id,
    metadata: { address: ws.address },
  });

  return ok(c, { deleted: true });
});

workstationRoutes.post("/api/workstations/auth", async (c) => {
  const body = await c.req.json();
  const address = typeof body.address === "string" ? body.address.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!address || !password)
    return fail(c, 400, "address and password are required.");

  const ws = await prisma.workstation.findUnique({ where: { address } });
  if (!ws) return fail(c, 401, "Invalid credentials.");

  const valid = await bcrypt.compare(password, ws.passwordHash);
  if (!valid) return fail(c, 401, "Invalid credentials.");

  await prisma.workstation.update({
    where: { id: ws.id },
    data: { status: "ACTIVE" },
  });

  await prisma.deviceToken.updateMany({
    where: { workstationId: ws.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const issued = issueDeviceToken();
  await prisma.deviceToken.create({
    data: {
      tokenHash: issued.tokenHash,
      label: "auth",
      deviceType: "WORKSTATION",
      workstationId: ws.id,
    },
  });

  return ok(c, {
    workstation: {
      id: ws.id,
      address: ws.address,
      name: ws.name,
      deviceId: ws.deviceId,
    },
    token: issued.rawToken,
  });
});

workstationRoutes.post("/api/workstations/tablet-pair", async (c) => {
  const body = await c.req.json();
  const address = typeof body.address === "string" ? body.address.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!address || !password)
    return fail(c, 400, "address and password are required.");

  const ws = await prisma.workstation.findUnique({ where: { address } });
  if (!ws) return fail(c, 401, "Invalid credentials.");

  const valid = await bcrypt.compare(password, ws.passwordHash);
  if (!valid) return fail(c, 401, "Invalid credentials.");

  return ok(c, {
    workstation: {
      id: ws.id,
      address: ws.address,
      name: ws.name,
    },
    wsPort: 8089,
  });
});
