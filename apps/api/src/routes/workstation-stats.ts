import { Hono } from "hono";
import type { AppBindings } from "../types.js";
import { prisma } from "../lib/prisma.js";
import { fail, ok } from "../utils/json.js";

export const workstationStatsRoutes = new Hono<AppBindings>();

function parseNonNegativeInt(value: string | undefined, fallback: number): number | null {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

function parseIsoDate(value: string | undefined): Date | null | undefined {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

workstationStatsRoutes.get("/api/workstations/:workstationId/stats", async (c) => {
  const workstationId = c.req.param("workstationId");

  const workstation = await prisma.workstation.findUnique({
    where: { id: workstationId },
    select: { id: true, lastSeenAt: true },
  });

  if (!workstation) {
    return fail(c, 404, "Workstation not found.");
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [totalDetections, detectionsToday, totalMatches, matchesToday] = await Promise.all([
    prisma.detection.count({ where: { workstationId } }),
    prisma.detection.count({ where: { workstationId, occurredAt: { gte: todayStart } } }),
    prisma.matchEvent.count({ where: { workstationId } }),
    prisma.matchEvent.count({ where: { workstationId, createdAt: { gte: todayStart } } }),
  ]);

  return ok(c, {
    totalDetections,
    detectionsToday,
    totalMatches,
    matchesToday,
    lastSeenAt: workstation.lastSeenAt,
  });
});

workstationStatsRoutes.get("/api/detections", async (c) => {
  const workstationId = c.req.query("workstationId")?.trim() || undefined;
  const plate = c.req.query("plate")?.trim() || undefined;
  const from = parseIsoDate(c.req.query("from"));
  const to = parseIsoDate(c.req.query("to"));
  const page = parseNonNegativeInt(c.req.query("page"), 1);
  const limit = parseNonNegativeInt(c.req.query("limit"), 50);
  const offset = parseNonNegativeInt(c.req.query("offset"), undefined as unknown as number);

  if (from === undefined || to === undefined) {
    return fail(c, 400, "from and to must be valid ISO date strings.");
  }

  if (from && to && from > to) {
    return fail(c, 400, "from must be earlier than or equal to to.");
  }

  if (limit === null || limit < 1) {
    return fail(c, 400, "limit must be a positive integer.");
  }

  if (page === null || page < 1) {
    return fail(c, 400, "page must be a positive integer.");
  }

  const clampedLimit = Math.min(limit, 200);
  const skip = offset ?? ((page - 1) * clampedLimit);

  const where: Record<string, unknown> = {};
  if (workstationId) where.workstationId = workstationId;
  if (plate) where.plate = { contains: plate, mode: "insensitive" };
  if (from || to) {
    where.occurredAt = { gte: from ?? undefined, lte: to ?? undefined };
  }

  const [detections, total] = await Promise.all([
    prisma.detection.findMany({
      where,
      include: {
        workstation: { select: { name: true, deviceId: true } },
        matchEvents: { select: { id: true, alertStatus: true }, take: 1 },
      },
      orderBy: { occurredAt: "desc" },
      skip,
      take: clampedLimit,
    }),
    prisma.detection.count({ where }),
  ]);

  return ok(c, { detections, total, page, limit: clampedLimit });
});

workstationStatsRoutes.get("/api/analytics/summary", async (c) => {
  const workstationId = c.req.query("workstationId")?.trim() || undefined;
  const from = c.req.query("from") ? new Date(c.req.query("from")!) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const to = c.req.query("to") ? new Date(c.req.query("to")!) : new Date();

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return fail(c, 400, "from and to must be valid ISO date strings.");
  }

  const workstationFilter = workstationId ? { workstationId } : {};

  // Totals
  const [totalDetections, totalMatches, detectionsInRange, matchesInRange] = await Promise.all([
    prisma.detection.count({ where: workstationFilter }),
    prisma.matchEvent.count({ where: workstationFilter }),
    prisma.detection.count({ where: { ...workstationFilter, occurredAt: { gte: from, lte: to } } }),
    prisma.matchEvent.count({ where: { ...workstationFilter, createdAt: { gte: from, lte: to } } }),
  ]);

  // Per-workstation breakdown
  const workstations = await prisma.workstation.findMany({
    where: workstationId ? { id: workstationId } : undefined,
    select: { id: true, name: true, status: true, lastSeenAt: true },
    orderBy: { name: "asc" },
  });

  const byWorkstation = await Promise.all(
    workstations.map(async (ws) => {
      const [wsDetections, wsMatches] = await Promise.all([
        prisma.detection.count({ where: { workstationId: ws.id, occurredAt: { gte: from, lte: to } } }),
        prisma.matchEvent.count({ where: { workstationId: ws.id, createdAt: { gte: from, lte: to } } }),
      ]);
      return {
        workstationId: ws.id,
        name: ws.name,
        status: ws.status,
        lastSeenAt: ws.lastSeenAt,
        detectionsInRange: wsDetections,
        matchesInRange: wsMatches,
        hitRate: wsDetections > 0 ? wsMatches / wsDetections : 0,
      };
    })
  );

  // Daily breakdown for chart
  const days: Array<{ date: string; detections: number; matches: number }> = [];
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  while (cursor <= to) {
    const dayStart = new Date(cursor);
    const dayEnd = new Date(cursor);
    dayEnd.setUTCHours(23, 59, 59, 999);
    const [d, m] = await Promise.all([
      prisma.detection.count({ where: { ...workstationFilter, occurredAt: { gte: dayStart, lte: dayEnd } } }),
      prisma.matchEvent.count({ where: { ...workstationFilter, createdAt: { gte: dayStart, lte: dayEnd } } }),
    ]);
    days.push({ date: cursor.toISOString().split("T")[0]!, detections: d, matches: m });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return ok(c, {
    totalDetections,
    totalMatches,
    detectionsInRange,
    matchesInRange,
    hitRate: detectionsInRange > 0 ? matchesInRange / detectionsInRange : 0,
    byWorkstation,
    daily: days,
  });
});
