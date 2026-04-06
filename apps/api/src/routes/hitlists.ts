import { Hono } from "hono";
import type { AppBindings } from "../types.js";
import { prisma } from "../lib/prisma.js";
import { normalizePlate } from "../utils/plate.js";
import { fail, ok } from "../utils/json.js";
import { parseOptionalDateInput } from "../utils/date.js";
import { writeAuditLog } from "../lib/audit.js";
import { encryptOptional, decryptOptional } from "../lib/encryption.js";

export const hitlistRoutes = new Hono<AppBindings>();

function decryptEntry<T extends { ownerName?: string | null; ownerContact?: string | null; extendedCaseNotes?: string | null }>(entry: T): T {
  return {
    ...entry,
    ownerName: decryptOptional(entry.ownerName),
    ownerContact: decryptOptional(entry.ownerContact),
    extendedCaseNotes: decryptOptional(entry.extendedCaseNotes),
  };
}

function decryptEntries<T extends { ownerName?: string | null; ownerContact?: string | null; extendedCaseNotes?: string | null }>(entries: T[]): T[] {
  return entries.map(decryptEntry);
}

interface HitlistEntryInput {
  plateOriginal?: string;
  plate?: string;
  plateNormalized?: string;
  countryOrRegion?: string;
  priority?: string;
  status?: string;
  reasonCode?: string;
  reasonSummary?: string;
  caseReference?: string;
  sourceAgency?: string;
  validFrom?: string;
  validUntil?: string;
  tags?: string[];
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  vehicleCategory?: string;
  ownerName?: string;
  ownerContact?: string;
  extendedCaseNotes?: string;
}

hitlistRoutes.post("/api/hitlists", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : null;

  if (!name) {
    return fail(c, 400, "Hitlist name is required.");
  }

  const hitlist = await prisma.hitlist.create({
    data: {
      name,
      description,
      status: "ACTIVE",
      createdByUserId: user?.id,
    },
  });

  await writeAuditLog({
    actorUser: user,
    action: "hitlist.created",
    entityType: "hitlist",
    entityId: hitlist.id,
    metadata: { name },
  });

  return ok(c, hitlist, 201);
});

hitlistRoutes.get("/api/hitlists", async (c) => {
  const hitlists = await prisma.hitlist.findMany({
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return ok(c, hitlists);
});

hitlistRoutes.get("/api/hitlists/:hitlistId", async (c) => {
  const hitlist = await prisma.hitlist.findUnique({
    where: { id: c.req.param("hitlistId") },
    include: {
      versions: {
        include: {
          entries: true,
        },
        orderBy: { versionNumber: "desc" },
      },
    },
  });

  if (!hitlist) {
    return fail(c, 404, "Hitlist not found.");
  }

  const decrypted = {
    ...hitlist,
    versions: hitlist.versions.map((v) => ({
      ...v,
      entries: decryptEntries(v.entries),
    })),
  };

  return ok(c, decrypted);
});

hitlistRoutes.post("/api/hitlists/:hitlistId/versions", async (c) => {
  const user = c.get("user");
  const hitlistId = c.req.param("hitlistId");
  const body = await c.req.json();
  const note = typeof body.note === "string" ? body.note.trim() : null;
  const entries: HitlistEntryInput[] = Array.isArray(body.entries) ? body.entries : [];

  if (entries.length === 0) {
    return fail(c, 400, "At least one entry is required for a new version.");
  }

  const hitlist = await prisma.hitlist.findUnique({ where: { id: hitlistId } });
  if (!hitlist) {
    return fail(c, 404, "Hitlist not found.");
  }

  const nextVersion = hitlist.currentVersionNumber + 1;
  const normalizedEntries = [];

  for (const [index, entry] of entries.entries()) {
    const validFrom = parseOptionalDateInput(entry.validFrom);
    const validUntil = parseOptionalDateInput(entry.validUntil);

    if (validFrom === undefined) {
      return fail(c, 400, `entries[${index}].validFrom must be a valid ISO date string.`);
    }

    if (validUntil === undefined) {
      return fail(c, 400, `entries[${index}].validUntil must be a valid ISO date string.`);
    }

    normalizedEntries.push({
      plateOriginal: String(entry.plateOriginal ?? entry.plate ?? "").trim(),
      plateNormalized: normalizePlate(String(entry.plateNormalized ?? entry.plateOriginal ?? entry.plate ?? "")),
      countryOrRegion: typeof entry.countryOrRegion === "string" ? entry.countryOrRegion : null,
      priority: typeof entry.priority === "string" ? entry.priority : null,
      status: typeof entry.status === "string" ? entry.status : "active",
      reasonCode: typeof entry.reasonCode === "string" ? entry.reasonCode : null,
      reasonSummary: typeof entry.reasonSummary === "string" ? entry.reasonSummary : null,
      caseReference: typeof entry.caseReference === "string" ? entry.caseReference : null,
      sourceAgency: typeof entry.sourceAgency === "string" ? entry.sourceAgency : null,
      validFrom,
      validUntil,
      tags: Array.isArray(entry.tags)
        ? entry.tags.filter((tag): tag is string => typeof tag === "string")
        : undefined,
      vehicleMake: typeof entry.vehicleMake === "string" ? entry.vehicleMake : null,
      vehicleModel: typeof entry.vehicleModel === "string" ? entry.vehicleModel : null,
      vehicleColor: typeof entry.vehicleColor === "string" ? entry.vehicleColor : null,
      vehicleCategory: typeof entry.vehicleCategory === "string" ? entry.vehicleCategory : null,
      ownerName: encryptOptional(typeof entry.ownerName === "string" ? entry.ownerName : null),
      ownerContact: encryptOptional(typeof entry.ownerContact === "string" ? entry.ownerContact : null),
      extendedCaseNotes: encryptOptional(typeof entry.extendedCaseNotes === "string" ? entry.extendedCaseNotes : null),
    });
  }

  const version = await prisma.hitlistVersion.create({
    data: {
      hitlistId,
      versionNumber: nextVersion,
      note,
      createdByUserId: user?.id,
      entries: {
        create: normalizedEntries,
      },
    },
    include: { entries: true },
  });

  await prisma.hitlist.update({
    where: { id: hitlistId },
    data: {
      currentVersionNumber: nextVersion,
      status: "ACTIVE",
    },
  });

  await writeAuditLog({
    actorUser: user,
    action: "hitlist.version.created",
    entityType: "hitlist_version",
    entityId: version.id,
    metadata: { hitlistId, versionNumber: nextVersion, entryCount: entries.length },
  });

  const decryptedVersion = {
    ...version,
    entries: decryptEntries(version.entries),
  };

  return ok(c, decryptedVersion, 201);
});

hitlistRoutes.post("/api/hitlists/:hitlistId/assign", async (c) => {
  const user = c.get("user");
  const hitlistId = c.req.param("hitlistId");
  const body = await c.req.json();
  const workstationIds: unknown = body.workstationIds;

  if (!Array.isArray(workstationIds) || workstationIds.length === 0) {
    return fail(c, 400, "workstationIds must be a non-empty array.");
  }

  const hitlist = await prisma.hitlist.findUnique({ where: { id: hitlistId } });
  if (!hitlist) {
    return fail(c, 404, "Hitlist not found.");
  }

  const workstations = await prisma.workstation.findMany({
    where: { id: { in: workstationIds as string[] } },
    select: { id: true },
  });

  const foundIds = new Set(workstations.map((w) => w.id));
  const missing = (workstationIds as string[]).filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    return fail(c, 400, `Workstation(s) not found: ${missing.join(", ")}`);
  }

  const result = await prisma.hitlistAssignment.createMany({
    data: (workstationIds as string[]).map((wId) => ({
      hitlistId,
      workstationId: wId,
      assignedBy: user?.id ?? null,
    })),
    skipDuplicates: true,
  });

  await writeAuditLog({
    actorUser: user,
    action: "hitlist.assigned",
    entityType: "hitlist",
    entityId: hitlistId,
    metadata: { workstationIds, count: result.count },
  });

  return ok(c, { assigned: result.count }, 201);
});

hitlistRoutes.delete("/api/hitlists/:hitlistId/assign/:workstationId", async (c) => {
  const user = c.get("user");
  const hitlistId = c.req.param("hitlistId");
  const workstationId = c.req.param("workstationId");

  await prisma.hitlistAssignment.deleteMany({
    where: { hitlistId, workstationId },
  });

  await writeAuditLog({
    actorUser: user,
    action: "hitlist.unassigned",
    entityType: "hitlist",
    entityId: hitlistId,
    metadata: { workstationId },
  });

  return ok(c, { success: true });
});

hitlistRoutes.get("/api/hitlists/:hitlistId/assignments", async (c) => {
  const hitlistId = c.req.param("hitlistId");

  const assignments = await prisma.hitlistAssignment.findMany({
    where: { hitlistId },
    include: {
      workstation: {
        select: { id: true, deviceId: true, name: true, status: true },
      },
    },
    orderBy: { assignedAt: "desc" },
  });

  return ok(c, assignments);
});

hitlistRoutes.post("/api/hitlists/:hitlistId/assign-all", async (c) => {
  const user = c.get("user");
  const hitlistId = c.req.param("hitlistId");

  const hitlist = await prisma.hitlist.findUnique({ where: { id: hitlistId } });
  if (!hitlist) {
    return fail(c, 404, "Hitlist not found.");
  }

  const activeWorkstations = await prisma.workstation.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });

  const result = await prisma.hitlistAssignment.createMany({
    data: activeWorkstations.map((w) => ({
      hitlistId,
      workstationId: w.id,
      assignedBy: user?.id ?? null,
    })),
    skipDuplicates: true,
  });

  await writeAuditLog({
    actorUser: user,
    action: "hitlist.assigned",
    entityType: "hitlist",
    entityId: hitlistId,
    metadata: { allActive: true, count: result.count },
  });

  return ok(c, { assigned: result.count }, 201);
});

hitlistRoutes.get("/api/hitlists/:hitlistId/versions", async (c) => {
  const versions = await prisma.hitlistVersion.findMany({
    where: { hitlistId: c.req.param("hitlistId") },
    include: { entries: true },
    orderBy: { versionNumber: "desc" },
  });

  const decryptedVersions = versions.map((v) => ({
    ...v,
    entries: decryptEntries(v.entries),
  }));

  return ok(c, decryptedVersions);
});
