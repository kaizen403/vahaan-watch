import { describe, expect, it, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

const app = createApp();

let adminCookie = "";
let scannerCookie = "";
let hitlistId = "";
let versionId = "";
const detectionIds: string[] = [];

async function req(
  method: string,
  path: string,
  body?: unknown,
  cookie?: string,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";
  if (cookie) headers["Cookie"] = cookie;

  return app.request(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
}

async function signIn(email: string, password: string): Promise<string> {
  const res = await req("POST", "/api/auth/sign-in/email", { email, password });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`sign-in failed (${res.status}): ${text}`);
  }
  return res.headers.getSetCookie().join("; ");
}

async function ensureScannerRole() {
  await prisma.role.upsert({
    where: { name: "scanner" },
    update: {},
    create: {
      name: "scanner",
      description: "Field scanning operators",
      permissions: ["portal:scan"] as never,
    },
  });
}

async function ensureScannerUser() {
  const email = "test-scanner@test.com";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return;

  const user = await prisma.user.create({
    data: {
      email,
      name: "Test Scanner",
      username: "testscanner",
      displayUsername: "testscanner",
      role: "scanner",
      emailVerified: true,
    },
  });

  await prisma.account.create({
    data: {
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: await bcrypt.hash("testscanner", 10),
    },
  });
}

beforeAll(async () => {
  adminCookie = await signIn("sibi@sibi.com", "sibi");

  await ensureScannerRole();
  await ensureScannerUser();
  scannerCookie = await signIn("test-scanner@test.com", "testscanner");

  const hitlist = await prisma.hitlist.create({
    data: {
      name: "__test_portal_scan__",
      status: "ACTIVE",
      currentVersionNumber: 1,
      versions: {
        create: {
          versionNumber: 1,
          entries: {
            create: [
              {
                plateOriginal: "TEST-123",
                plateNormalized: "TEST123",
                priority: "high",
                status: "active",
                reasonSummary: "Stolen vehicle",
                caseReference: "CASE-001",
                sourceAgency: "Integration Test PD",
              },
              {
                plateOriginal: "AP-39-BK-2015",
                plateNormalized: "AP39BK2015",
                priority: "medium",
                status: "active",
                reasonSummary: "Wanted suspect",
                caseReference: "CASE-002",
                sourceAgency: "Integration Test PD",
              },
            ],
          },
        },
      },
    },
    include: { versions: true },
  });

  hitlistId = hitlist.id;
  versionId = hitlist.versions[0].id;
});

afterAll(async () => {
  if (detectionIds.length) {
    await prisma.outboxJob.deleteMany({
      where: { aggregateId: { in: detectionIds }, aggregateType: "detection" },
    });
    await prisma.matchEvent.deleteMany({
      where: { detectionId: { in: detectionIds } },
    });
    await prisma.outboxJob.deleteMany({
      where: {
        aggregateType: "match_event",
        payload: { path: ["detectionId"], string_contains: detectionIds[0] ?? "__none__" },
      },
    });
    await prisma.detection.deleteMany({
      where: { id: { in: detectionIds } },
    });
  }

  if (hitlistId) {
    await prisma.hitlistEntry.deleteMany({ where: { hitlistVersionId: versionId } });
    await prisma.hitlistVersion.deleteMany({ where: { hitlistId } });
    await prisma.hitlist.delete({ where: { id: hitlistId } });
  }

  await prisma.$disconnect();
});

describe("POST /api/portal/scan", () => {
  it("returns 401 without auth", async () => {
    const res = await req("POST", "/api/portal/scan", { plate: "ABC123" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when plate is missing", async () => {
    const res = await req("POST", "/api/portal/scan", {}, adminCookie);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("scan with no hitlist match returns isHit=false", async () => {
    const res = await req(
      "POST",
      "/api/portal/scan",
      { plate: "NOMATCH999", country: "IN" },
      adminCookie,
    );
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.isHit).toBe(false);
    expect(json.data.matchCount).toBe(0);
    expect(json.data.matches).toHaveLength(0);
    expect(json.data.detection.plate).toBe("NOMATCH999");

    detectionIds.push(json.data.detection.id);
  });

  it("scan with hitlist match returns isHit=true with match details", async () => {
    const res = await req(
      "POST",
      "/api/portal/scan",
      { plate: "TEST-123", country: "IN", confidence: 0.95 },
      adminCookie,
    );
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.data.isHit).toBe(true);
    expect(json.data.matchCount).toBeGreaterThanOrEqual(1);

    const match = json.data.matches[0];
    expect(match.alertStatus).toBe("PENDING");
    expect(match.hitlistEntry.plateOriginal).toBe("TEST-123");
    expect(match.hitlistEntry.priority).toBe("high");
    expect(match.hitlistEntry.reasonSummary).toBe("Stolen vehicle");
    expect(match.hitlistEntry.caseReference).toBe("CASE-001");

    expect(json.data.detection.plate).toBe("TEST-123");
    expect(json.data.detection.confidence).toBe(0.95);

    detectionIds.push(json.data.detection.id);
  });

  it("scan creates Detection and OutboxJob in DB", async () => {
    const res = await req(
      "POST",
      "/api/portal/scan",
      { plate: "AP-39 BK 2015", country: "IN" },
      adminCookie,
    );
    expect(res.status).toBe(201);

    const json = await res.json();
    const detId = json.data.detection.id;
    detectionIds.push(detId);

    const detection = await prisma.detection.findUnique({ where: { id: detId } });
    expect(detection).not.toBeNull();
    expect(detection!.plate).toBe("AP-39 BK 2015");

    const outboxJobs = await prisma.outboxJob.findMany({
      where: { aggregateId: detId, aggregateType: "detection" },
    });
    expect(outboxJobs.length).toBeGreaterThanOrEqual(1);
    expect(outboxJobs[0].topic).toBe("detection.created");

    expect(json.data.isHit).toBe(true);
    expect(json.data.matchCount).toBeGreaterThanOrEqual(1);

    const matchOutbox = await prisma.outboxJob.findMany({
      where: { aggregateType: "match_event", topic: "match-event.created" },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    expect(matchOutbox.length).toBeGreaterThanOrEqual(1);
  });

  it("normalized plate matching works across formats", async () => {
    const res = await req(
      "POST",
      "/api/portal/scan",
      { plate: "test 123" },
      adminCookie,
    );
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.data.isHit).toBe(true);
    expect(json.data.detection.plate).toBe("test 123");

    detectionIds.push(json.data.detection.id);
  });

  it("scanner role can access /api/portal/scan", async () => {
    const res = await req(
      "POST",
      "/api/portal/scan",
      { plate: "SCANNER-TEST-001", country: "IN" },
      scannerCookie,
    );
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.detection.plate).toBe("SCANNER-TEST-001");

    detectionIds.push(json.data.detection.id);
  });

  it("scanner role cannot access admin-only routes", async () => {
    const res = await req("GET", "/api/devices", undefined, scannerCookie);
    expect(res.status).toBe(403);
  });

  it("scanner role cannot access hitlist management", async () => {
    const res = await req("GET", "/api/hitlists", undefined, scannerCookie);
    expect(res.status).toBe(403);
  });

  it("scanner role can read session", async () => {
    const res = await req("GET", "/api/session", undefined, scannerCookie);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.user.role).toBe("scanner");
  });
});
