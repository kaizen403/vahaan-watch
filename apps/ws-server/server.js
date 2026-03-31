const { WebSocketServer } = require("ws");
const { spawn } = require("child_process");
const { writeFile, mkdir, rm } = require("fs/promises");
const path = require("path");
const os = require("os");
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

const BINARY_PATH =
  process.env.BINARY_PATH ||
  "/home/kaizen/sibi/adarecog/sdk_samples/samples/C++/build/05_cloud/cpp_sample_05_cloud";
const API_KEY = process.env.CARMEN_API_KEY || "";
const WS_PORT = parseInt(process.env.WS_PORT || "3002");
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FRAMES_PER_BATCH = 10;
const TMP_DIR = path.join(os.tmpdir(), "anpr_rt");

const SEPARATOR = "------------------------------------------------------";
let blacklistCollection = null;
let detectionsCollection = null;
let db = null;

async function initBlacklistDb() {
  db = await connectDb();
  blacklistCollection = await getBlacklistCollection();
  detectionsCollection = await getDetectionsCollection();
  const seedResult = await seedDummyBlacklist(db, blacklistCollection);
  console.log(
    `[db] connected ${DB_SCHEMA}.${BLACKLIST_COLLECTION} (seed inserted=${seedResult.inserted}, skipped=${seedResult.skipped})`
  );
  console.log(`[db] connected ${DB_SCHEMA}.${DETECTIONS_COLLECTION}`);
}

function parseBlock(block) {
  const det = {};
  for (const line of block.split("\n").map((l) => l.trim()).filter(Boolean)) {
    if (line.startsWith("Unix timestamp:"))
      det.timestamp = line.replace("Unix timestamp:", "").trim();
    else if (line.startsWith("Plate text:"))
      det.plate = line.replace("Plate text:", "").trim();
    else if (line.startsWith("Country:"))
      det.country = line.replace("Country:", "").trim();
    else if (line.startsWith("Make:"))
      det.make = line.replace("Make:", "").trim();
    else if (line.startsWith("Model:"))
      det.model = line.replace("Model:", "").trim();
    else if (line.startsWith("Color:"))
      det.color = line.replace("Color:", "").trim();
    else if (line.startsWith("Category:"))
      det.category = line.replace("Category:", "").trim();
  }
  return det.plate ? det : null;
}

function parseAllDetections(output) {
  const detections = [];
  for (const block of output.split(SEPARATOR)) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const det = parseBlock(trimmed);
    if (det) detections.push(det);
  }
  return detections;
}

function framesToVideo(frameDir, count, outputPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, [
      "-y",
      "-framerate", "5",
      "-i", path.join(frameDir, "frame_%04d.jpg"),
      "-frames:v", String(count),
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-pix_fmt", "yuv420p",
      outputPath,
    ]);
    let stderr = "";
    proc.stderr.on("data", (c) => { stderr += c.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}): ${stderr.slice(-200)}`));
    });
    proc.on("error", reject);
  });
}

function runBinary(region, videoPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(BINARY_PATH, [region, `file://${videoPath}`, API_KEY]);
    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("Binary timed out"));
    }, 60_000);

    proc.stdout.on("data", (c) => { stdout += c.toString(); });
    proc.stderr.on("data", (c) => { stderr += c.toString(); });

    proc.on("close", () => {
      clearTimeout(timeout);
      if (stderr) {
        const critical = stderr.split("\n").filter((l) => l.includes("[Critical]"));
        if (critical.length > 0) console.log(`  [binary] ${critical[0].slice(0, 150)}`);
      }
      resolve(parseAllDetections(stdout));
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function cleanupDir(dir) {
  try { await rm(dir, { recursive: true, force: true }); } catch {}
}

const wss = new WebSocketServer({ port: WS_PORT });
console.log(`Carmen ANPR WS server (batch mode) → ws://localhost:${WS_PORT}`);
initBlacklistDb().catch((err) => {
  console.error(`[db] failed to initialize blacklist DB: ${err.message}`);
  db = null;
  blacklistCollection = null;
  detectionsCollection = null;
});

process.on("SIGINT", async () => {
  await closeDb().catch(() => {});
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeDb().catch(() => {});
  process.exit(0);
});

let sessionCounter = 0;

wss.on("connection", (ws) => {
  console.log("[+] client connected");

  const sessionId = `s${Date.now()}_${sessionCounter++}`;
  let region = "EUR";
  let started = false;
  let stopped = false;
  let batchNum = 0;
  let processing = false;
  let sessionDir = null;
  let pendingFrames = [];

  ws.on("message", async (data, isBinary) => {
    if (stopped) return;

    if (isBinary) {
      if (!started) return;
      pendingFrames.push(Buffer.from(data));

      if (pendingFrames.length >= FRAMES_PER_BATCH && !processing) {
        const batch = pendingFrames.splice(0, FRAMES_PER_BATCH);
        processBatch(batch);
      }
      return;
    }

    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "start" && !started) {
        started = true;
        region = msg.region || "EUR";
        sessionDir = path.join(TMP_DIR, sessionId);
        await mkdir(sessionDir, { recursive: true });
        console.log(`  session=${sessionId} region=${region}`);
        ws.send(JSON.stringify({ type: "ready" }));
      } else if (msg.type === "getBlacklist") {
        if (!db || !blacklistCollection) {
          ws.send(JSON.stringify({
            type: "blacklist",
            success: false,
            message: "Blacklist DB unavailable",
            data: [],
          }));
          return;
        }

        const data = await getBlacklistedPlates(db, blacklistCollection, 100);
        ws.send(JSON.stringify({
          type: "blacklist",
          success: true,
          count: data.length,
          data,
        }));
      } else if (msg.type === "getRecentDetections") {
        if (!db || !detectionsCollection) {
          ws.send(JSON.stringify({
            type: "recentDetections",
            success: false,
            message: "Detections DB unavailable",
            data: [],
          }));
          return;
        }

        const limit = Number(msg.limit) > 0 ? Math.min(Number(msg.limit), 500) : 100;
        const data = await getRecentDetections(db, detectionsCollection, limit);
        ws.send(JSON.stringify({
          type: "recentDetections",
          success: true,
          count: data.length,
          data,
        }));
      }
    } catch {}
  });

  async function processBatch(frames) {
    if (processing || stopped) return;
    processing = true;
    batchNum++;
    const num = batchNum;
    const batchDir = path.join(sessionDir, `b${num}`);

    try {
      await mkdir(batchDir, { recursive: true });

      for (let i = 0; i < frames.length; i++) {
        await writeFile(
          path.join(batchDir, `frame_${String(i + 1).padStart(4, "0")}.jpg`),
          frames[i]
        );
      }

      const videoPath = path.join(batchDir, "clip.mp4");
      await framesToVideo(batchDir, frames.length, videoPath);

      const detections = await runBinary(region, videoPath);

      if (detections.length > 0 && ws.readyState === 1 && !stopped) {
        console.log(`  batch ${num}: ${detections.length} detection(s)`);
        for (const det of detections) {
          let blacklist = {
            isBlacklisted: false,
            normalizedPlate: "",
            record: null,
          };

          if (db && blacklistCollection) {
            try {
              blacklist = await isPlateBlacklisted(db, blacklistCollection, det.plate);
            } catch (err) {
              console.error(`  blacklist check failed: ${err.message}`);
            }
          }

          if (db && detectionsCollection) {
            try {
              await saveDetection(db, detectionsCollection, det, {
                sessionId,
                batchNum: num,
                region,
                blacklist,
              });
            } catch (err) {
              console.error(`  detection save failed: ${err.message}`);
            }
          }

          ws.send(
            JSON.stringify({
              type: "detection",
              data: {
                ...det,
                blacklist,
              },
            })
          );
        }
      } else {
        console.log(`  batch ${num}: no detections`);
      }
    } catch (err) {
      console.error(`  batch ${num} error: ${err.message}`);
      if (ws.readyState === 1 && !stopped) {
        ws.send(JSON.stringify({ type: "error", message: err.message }));
      }
    } finally {
      await cleanupDir(batchDir);
      processing = false;

      if (!stopped && pendingFrames.length >= FRAMES_PER_BATCH) {
        const batch = pendingFrames.splice(0, FRAMES_PER_BATCH);
        processBatch(batch);
      }
    }
  }

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    console.log(`[-] disconnected (${sessionId})`);
    pendingFrames = [];
    if (sessionDir) cleanupDir(sessionDir);
  };

  ws.on("close", cleanup);
  ws.on("error", cleanup);
});
