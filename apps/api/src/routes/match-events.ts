import { MatchStatus } from "@prisma/client";
import { Hono } from "hono";
import type { AppBindings } from "../types.js";
import { prisma } from "../lib/prisma.js";
import { fail, ok } from "../utils/json.js";
import { writeAuditLog } from "../lib/audit.js";

export const matchEventRoutes = new Hono<AppBindings>();

const MATCH_STATUSES: MatchStatus[] = [
  MatchStatus.PENDING,
  MatchStatus.ACKNOWLEDGED,
  MatchStatus.ESCALATED,
  MatchStatus.FALSE_POSITIVE,
  MatchStatus.RESOLVED,
];

const MUTABLE_MATCH_STATUSES: MatchStatus[] = [
  MatchStatus.ACKNOWLEDGED,
  MatchStatus.ESCALATED,
  MatchStatus.FALSE_POSITIVE,
  MatchStatus.RESOLVED,
];

const matchEventInclude = {
  detection: {
    select: {
      plate: true,
      country: true,
      make: true,
      model: true,
      color: true,
      category: true,
      confidence: true,
      occurredAt: true,
      snapshotUrl: true,
    },
  },
  workstation: {
    select: {
      name: true,
      deviceId: true,
    },
  },
  hitlistEntry: {
    select: {
      plateOriginal: true,
      reasonSummary: true,
      priority: true,
      caseReference: true,
    },
  },
};

function isMatchStatus(value: string): value is MatchStatus {
  return MATCH_STATUSES.some((status) => status === value);
}

function isMutableMatchStatus(value: string): value is MatchStatus {
  return MUTABLE_MATCH_STATUSES.some((status) => status === value);
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? String(fallback));

  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function parseIsoDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}

matchEventRoutes.get("/api/match-events", async (c) => {
  const statusParam = c.req.query("status");
  const workstationId = c.req.query("workstationId")?.trim();
  const page = parsePositiveInteger(c.req.query("page"), 1);
  const requestedLimit = parsePositiveInteger(c.req.query("limit"), 50);
  const from = parseIsoDate(c.req.query("from"));
  const to = parseIsoDate(c.req.query("to"));

  if (statusParam && !isMatchStatus(statusParam)) {
    return fail(c, 400, "status must be a valid match status.");
  }

  if (!page) {
    return fail(c, 400, "page must be a positive integer.");
  }

  if (!requestedLimit) {
    return fail(c, 400, "limit must be a positive integer.");
  }

  if (from === undefined || to === undefined) {
    return fail(c, 400, "from and to must be valid ISO date strings.");
  }

  if (from && to && from > to) {
    return fail(c, 400, "from must be earlier than or equal to to.");
  }

  const status = statusParam && isMatchStatus(statusParam) ? statusParam : undefined;
  const limit = Math.min(requestedLimit, 100);
  const where = {
    alertStatus: status,
    workstationId: workstationId || undefined,
    createdAt: from || to
      ? {
          gte: from ?? undefined,
          lte: to ?? undefined,
        }
      : undefined,
  };

  const [items, total] = await Promise.all([
    prisma.matchEvent.findMany({
      where,
      include: matchEventInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.matchEvent.count({ where }),
  ]);

  return ok(c, {
    items,
    total,
    page,
    limit,
  });
});

matchEventRoutes.get("/api/match-events/stats", async (c) => {
  const grouped = await prisma.matchEvent.groupBy({
    by: ["alertStatus"],
    _count: { _all: true },
  });

  const counts = grouped.reduce(
    (accumulator, item) => {
      accumulator[item.alertStatus] = item._count._all;
      accumulator.total += item._count._all;
      return accumulator;
    },
    {
      PENDING: 0,
      ACKNOWLEDGED: 0,
      ESCALATED: 0,
      FALSE_POSITIVE: 0,
      RESOLVED: 0,
      total: 0,
    },
  );

  return ok(c, counts);
});

matchEventRoutes.patch("/api/match-events/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json();
  const alertStatus = typeof body.alertStatus === "string" ? body.alertStatus : "";

  if (!isMutableMatchStatus(alertStatus)) {
    return fail(c, 400, "alertStatus must be one of ACKNOWLEDGED, ESCALATED, FALSE_POSITIVE, or RESOLVED.");
  }

  if (body.note !== undefined && typeof body.note !== "string") {
    return fail(c, 400, "note must be a string when provided.");
  }

  const existing = await prisma.matchEvent.findUnique({ where: { id } });

  if (!existing) {
    return fail(c, 404, "Match event not found.");
  }

  const note = typeof body.note === "string" ? body.note.trim() || null : undefined;
  const matchEvent = await prisma.matchEvent.update({
    where: { id },
    data: {
      alertStatus,
      note,
    },
    include: matchEventInclude,
  });

  await writeAuditLog({
    actorUser: user,
    action: "match-event.status.updated",
    entityType: "match_event",
    entityId: matchEvent.id,
    metadata: {
      previousStatus: existing.alertStatus,
      alertStatus,
      ...(note !== undefined ? { note } : {}),
    },
  });

  return ok(c, matchEvent);
});
