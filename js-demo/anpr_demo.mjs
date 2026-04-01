import { readFileSync } from "fs";
import { execSync } from "child_process";
import path from "path";

const API_KEY = process.argv[2] || "70d0060fbe6e9f2ccaab538facbcb637e40a7555";
const VIDEO_PATH = process.argv[3] || "../anpr_1080p.mp4";
const API_URL = "https://api.cloud.adaptiverecognition.com/vehicle/anpr";

// ─── Extract frames from video using ffmpeg ───────────────────
function extractFrames(videoPath, outputDir, fps = 2) {
  console.log(
    `Extracting frames from: ${path.basename(videoPath)} (${fps} fps)...`,
  );
  execSync(`mkdir -p ${outputDir}`);
  execSync(
    `ffmpeg -y -i "${videoPath}" -vf "fps=${fps}" "${outputDir}/frame_%04d.jpg" 2>/dev/null`,
  );
  const files = execSync(`ls ${outputDir}/frame_*.jpg`)
    .toString()
    .trim()
    .split("\n");
  console.log(`Got ${files.length} frames\n`);
  return files;
}

// ─── Send image to Carmen Cloud Vehicle API ───────────────────
async function recognizePlate(imagePath) {
  const imageBuffer = readFileSync(imagePath);
  const base64Image = imageBuffer.toString("base64");

  const body = {
    image: base64Image,
    region: "EUR",
    location: "GBR",
    services: ["anpr", "mmr"],
  };

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text}`);
  }

  return response.json();
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   Carmen ANPR Demo - Node.js                ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`API Key: ${API_KEY.slice(0, 8)}...`);
  console.log(`Video:   ${VIDEO_PATH}\n`);

  const framesDir = "/tmp/carmen_frames";
  const frames = extractFrames(VIDEO_PATH, framesDir, 2);

  let totalDetections = 0;
  const seenPlates = new Set();

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const frameNum = path.basename(frame);

    try {
      const result = await recognizePlate(frame);

      // Check for vehicle detections in the response
      const vehicles = result.data?.vehicles || result.vehicles || [];
      for (const v of vehicles) {
        const plateText =
          v.plate?.unicodeText || v.plate?.plateText || v.plate?.text;
        if (plateText && !seenPlates.has(plateText)) {
          seenPlates.add(plateText);
          totalDetections++;
          console.log("──────────────────────────────────────────────");
          console.log(`  Frame:    ${frameNum} (${i + 1}/${frames.length})`);
          console.log(`  Plate:    ${plateText}`);
          console.log(`  Country:  ${v.plate?.country || "N/A"}`);
          if (v.mmr) {
            console.log(`  Make:     ${v.mmr?.make || "N/A"}`);
            console.log(`  Model:    ${v.mmr?.model || "N/A"}`);
            console.log(`  Color:    ${v.mmr?.color || "N/A"}`);
            console.log(`  Category: ${v.mmr?.category || "N/A"}`);
          }
          console.log("");
        }
      }

      // Progress dot
      if (vehicles.length === 0) process.stdout.write(".");
    } catch (err) {
      if (err.message.includes("403")) {
        console.error(`\n\n⚠ API returned 403 Forbidden.`);
        console.error(
          `Your API key is a Video SDK key (CloudNNC), not a Cloud REST API key.`,
        );
        console.error(
          `The JS demo needs a separate Carmen Cloud API key from https://carmencloud.com`,
        );
        console.error(
          `\nBut the C++ Video SDK demo works fine with this key! Run:`,
        );
        console.error(
          `  ./cpp_sample_05_cloud EUR "file:video.mp4" "${API_KEY}"\n`,
        );
        process.exit(1);
      }
      if (i === 0) console.error(`\n  First error: ${err.message}`);
      process.stdout.write("x");
    }

    // Small delay between requests
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\n\n══════════════════════════════════════════════`);
  console.log(`  Done! ${totalDetections} unique plates detected.`);
  console.log(`  Plates: ${[...seenPlates].join(", ") || "none"}`);
  console.log(`══════════════════════════════════════════════\n`);

  // Cleanup
  execSync(`rm -rf ${framesDir}`);
}

main().catch(console.error);
