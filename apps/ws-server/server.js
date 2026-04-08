const { timingSafeEqual } = require("node:crypto");
const { WebSocketServer } = require("ws");
const {
  connectDb,
  getBlacklistCollection,
  getDetectionsCollection,
  closeDb,
  DB_SCHEMA,
  BLACKLIST_COLLECTION,
  DETECTIONS_COLLECTION,
} = require("./lib/db");
const {
  seedDummyBlacklist,
  getBlacklistedPlates,
  isPlateBlacklisted,
} = require("./lib/blacklistService");
const {
  saveDetection,
  getRecentDetections,
} = require("./lib/detectionService");
const {
  startHitlistPolling,
  stopHitlistPolling,
} = require("./lib/hitlistClient");

// Support the newer realtime env name without breaking older deployments.
const VEHICLE_API_KEY =
  process.env.VEHICLE_API_KEY || process.env.CARMEN_API_KEY || "";
const VEHICLE_API_BASE =
  process.env.VEHICLE_API_BASE ||
  "https://ap-southeast-1.api.carmencloud.com/vehicle";
const parsedWsPort = parseInt(process.env.WS_PORT || "3002", 10);
const WS_PORT = Number.isFinite(parsedWsPort) ? parsedWsPort : 3002;
const WS_ADMIN_TOKEN = process.env.WS_ADMIN_TOKEN || "";
const parsedDbRetryMs = parseInt(process.env.DB_RETRY_MS || "5000", 10);
const DB_RETRY_MS =
  Number.isFinite(parsedDbRetryMs) && parsedDbRetryMs > 0
    ? parsedDbRetryMs
    : 5000;
const SHOULD_SEED_DUMMY_BLACKLIST =
  process.env.SEED_DUMMY_BLACKLIST === "true";

const DEDUP_MS = 8000;

let blacklistCollection = null;
let detectionsCollection = null;
let db = null;
let dbInitPromise = null;
let dbRetryTimer = null;

function resetDbState() {
  db = null;
  blacklistCollection = null;
  detectionsCollection = null;
}

function clearDbRetryTimer() {
  if (!dbRetryTimer) return;
  clearTimeout(dbRetryTimer);
  dbRetryTimer = null;
}

function scheduleDbRetry() {
  if (dbRetryTimer) return;

  console.log(`[db] retrying initialization in ${DB_RETRY_MS}ms`);
  dbRetryTimer = setTimeout(() => {
    dbRetryTimer = null;
    void initDb()
      .then(() => { startHitlistPolling(); })
      .catch(() => {});
  }, DB_RETRY_MS);
}

async function handleDbFailure(err, message) {
  console.error(`${message}: ${err.message}`);
  resetDbState();
  await closeDb().catch(() => {});
  scheduleDbRetry();
}

async function initDb() {
  if (db && blacklistCollection && detectionsCollection) return db;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    const connection = await connectDb();
    const blacklistTable = await getBlacklistCollection();
    const detectionsTable = await getDetectionsCollection();

    db = connection;
    blacklistCollection = blacklistTable;
    detectionsCollection = detectionsTable;

    if (SHOULD_SEED_DUMMY_BLACKLIST) {
      const seedResult = await seedDummyBlacklist(connection, blacklistTable);
      console.log(
        `[db] connected ${DB_SCHEMA}.${BLACKLIST_COLLECTION} (seed inserted=${seedResult.inserted}, skipped=${seedResult.skipped})`,
      );
    } else {
      console.log(
        `[db] connected ${DB_SCHEMA}.${BLACKLIST_COLLECTION} (demo seed disabled)`,
      );
    }

    console.log(`[db] connected ${DB_SCHEMA}.${DETECTIONS_COLLECTION}`);
    clearDbRetryTimer();
    return connection;
  })();

  try {
    return await dbInitPromise;
  } catch (err) {
    await handleDbFailure(err, "[db] failed to initialize DB");
    throw err;
  } finally {
    dbInitPromise = null;
  }
}

async function ensureDbReady() {
  if (db && blacklistCollection && detectionsCollection) return true;

  try {
    await initDb();
    return true;
  } catch {
    return false;
  }
}

function tokensMatch(expected, received) {
  if (!expected || typeof received !== "string") return false;

  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(received);

  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

function privilegedAccessMessage() {
  return WS_ADMIN_TOKEN
    ? "Authentication required."
    : "Privileged websocket access is disabled.";
}

const wss = new WebSocketServer({ port: WS_PORT });
console.log(`Carmen ANPR WS server (Vehicle API) → ws://localhost:${WS_PORT}`);

void initDb().catch(() => {});

process.on("SIGINT", async () => {
  stopHitlistPolling();
  await closeDb().catch(() => {});
  process.exit(0);
});

process.on("SIGTERM", async () => {
  stopHitlistPolling();
  await closeDb().catch(() => {});
  process.exit(0);
});

wss.on("connection", (ws) => {
  console.log("[+] client connected");

  let region = "sas";
  let started = false;
  let stopped = false;
  let continuous = false;
  let privileged = false;
  let processing = false;
  let queuedFrame = null;
  const lastSeen = new Map();

  ws.on("message", async (data, isBinary) => {
    if (stopped) return;

    if (!isBinary) {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "authenticate") {
          if (!WS_ADMIN_TOKEN) {
            ws.send(
              JSON.stringify({
                type: "auth",
                success: false,
                message: "Privileged websocket access is disabled.",
              }),
            );
            return;
          }

          privileged = tokensMatch(WS_ADMIN_TOKEN, msg.token);
          ws.send(
            JSON.stringify({
              type: "auth",
              success: privileged,
              message: privileged ? "Authenticated." : "Invalid websocket token.",
            }),
          );
        } else if (msg.type === "start" && !started) {
          if (!VEHICLE_API_KEY) {
            ws.send(
              JSON.stringify({
                type: "error",
                message:
                  "Realtime scanning is not configured: missing VEHICLE_API_KEY.",
              }),
            );
            stopped = true;
            return;
          }
          started = true;
          region = (msg.region || "sas").toLowerCase();
          continuous = Boolean(msg.continuous);
          console.log(`  session started, region=${region}, continuous=${continuous}`);
          ws.send(JSON.stringify({ type: "ready" }));
        } else if (msg.type === "getBlacklist") {
          if (!privileged) {
            ws.send(
              JSON.stringify({
                type: "blacklist",
                success: false,
                message: privilegedAccessMessage(),
                data: [],
              }),
            );
            return;
          }

          if (!(await ensureDbReady())) {
            ws.send(
              JSON.stringify({
                type: "blacklist",
                success: false,
                message: "Blacklist DB unavailable",
                data: [],
              }),
            );
            return;
          }

          try {
            const data = await getBlacklistedPlates(db, blacklistCollection, 100);
            ws.send(
              JSON.stringify({
                type: "blacklist",
                success: true,
                count: data.length,
                data,
              }),
            );
          } catch (err) {
            await handleDbFailure(err, "[db] blacklist lookup failed");
            ws.send(
              JSON.stringify({
                type: "blacklist",
                success: false,
                message: "Blacklist DB unavailable",
                data: [],
              }),
            );
          }
        } else if (msg.type === "getRecentDetections") {
          if (!privileged) {
            ws.send(
              JSON.stringify({
                type: "recentDetections",
                success: false,
                message: privilegedAccessMessage(),
                data: [],
              }),
            );
            return;
          }

          if (!(await ensureDbReady())) {
            ws.send(
              JSON.stringify({
                type: "recentDetections",
                success: false,
                message: "Detections DB unavailable",
                data: [],
              }),
            );
            return;
          }

          const limit =
            Number(msg.limit) > 0 ? Math.min(Number(msg.limit), 500) : 100;

          try {
            const data = await getRecentDetections(
              db,
              detectionsCollection,
              limit,
            );
            ws.send(
              JSON.stringify({
                type: "recentDetections",
                success: true,
                count: data.length,
                data,
              }),
            );
          } catch (err) {
            await handleDbFailure(err, "[db] recent detections lookup failed");
            ws.send(
              JSON.stringify({
                type: "recentDetections",
                success: false,
                message: "Detections DB unavailable",
                data: [],
              }),
            );
          }
        }
      } catch {}
      return;
    }

    if (!started) return;

    queuedFrame = Buffer.from(data);
    if (processing) return;
    void processLatestFrame();
  });

  async function processLatestFrame() {
    if (processing || stopped || !queuedFrame) return;
    processing = true;

    while (!stopped && queuedFrame) {
      const jpegBuffer = queuedFrame;
      queuedFrame = null;
      console.log(`  frame received (${jpegBuffer.length}b)`);

      const t0 = Date.now();
      try {
        const detections = await callVehicleAPI(jpegBuffer, region);
        const elapsed = Date.now() - t0;

        if (detections.length === 0) {
          console.log(
            `  frame: no plate (${elapsed}ms, ${jpegBuffer.length}b)`,
          );
        }

        const now = Date.now();
        for (const det of detections) {
          const last = lastSeen.get(det.plate) || 0;
          if (now - last < DEDUP_MS) continue;
          lastSeen.set(det.plate, now);

          console.log(
            `  detected: ${det.plate} (${det.country}) conf=${det.confidence} ${elapsed}ms`,
          );

          let blacklist = {
            isBlacklisted: false,
            normalizedPlate: "",
            record: null,
          };

          if (!db || !blacklistCollection || !detectionsCollection) {
            await ensureDbReady();
          }

          if (db && blacklistCollection) {
            try {
              blacklist = await isPlateBlacklisted(
                db,
                blacklistCollection,
                det.plate,
              );
            } catch (err) {
              await handleDbFailure(err, "  blacklist check failed");
            }
          }

          if (db && detectionsCollection) {
            try {
              await saveDetection(db, detectionsCollection, det, {
                region,
                blacklist,
              });
            } catch (err) {
              await handleDbFailure(err, "  detection save failed");
            }
          }

          if (ws.readyState === 1 && !stopped) {
            ws.send(
              JSON.stringify({
                type: "detection",
                data: {
                  ...det,
                  blacklist,
                },
              }),
            );
          }
          if (!continuous) {
            queuedFrame = null;
            stopped = true;
            break;
          }
        }
      } catch (err) {
        console.error(`  frame error: ${err.message}`);
      }
    }

    processing = false;
    if (!stopped && queuedFrame) {
      void processLatestFrame();
    }
  }

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    queuedFrame = null;
    console.log("[-] client disconnected");
  };

  ws.on("close", cleanup);
  ws.on("error", cleanup);
});

async function callVehicleAPI(jpegBuffer, region) {
  const form = new FormData();
  const blob = new Blob([jpegBuffer], { type: "image/jpeg" });
  form.append("image", blob, "frame.jpg");
  form.append("service", "anpr,mmr");

  const url = `${VEHICLE_API_BASE}/${region}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "X-Api-Key": VEHICLE_API_KEY },
    body: form,
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`API ${resp.status}: ${body.slice(0, 120)}`);
  }

  return parseVehicles(await resp.json());
}

function parseVehicles(json) {
  const results = [];
  for (const v of json?.data?.vehicles || []) {
    const plate = v.plate;
    if (!plate?.found || !plate?.unicodeText) continue;
    const mmr = v.mmr;
    results.push({
      timestamp: new Date().toISOString(),
      plate: plate.unicodeText,
      country: plate.country || "",
      category: mmr?.category || "",
      make: mmr?.make || "",
      model: mmr?.model || "",
      color: mmr?.colorName || "",
      confidence: plate.confidence ?? 0,
    });
  }
  return results;
}
