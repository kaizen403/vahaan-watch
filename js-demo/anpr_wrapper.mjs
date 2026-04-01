import { execSync, spawn } from "child_process";
import path from "path";

// This wraps the C++ Video SDK binary (which works with your CloudNNC key)
const CPP_BINARY =
  "/home/kaizen/sibi/adarecog/sdk_samples/samples/C++/build/05_cloud/cpp_sample_05_cloud";
const API_KEY = process.argv[2] || "70d0060fbe6e9f2ccaab538facbcb637e40a7555";
const VIDEO_PATH =
  process.argv[3] || "/home/kaizen/sibi/adarecog/anpr_1080p.mp4";
const REGION = process.argv[4] || "EUR";

console.log("╔══════════════════════════════════════════════╗");
console.log("║   Carmen ANPR - Node.js Wrapper Demo        ║");
console.log("╚══════════════════════════════════════════════╝");
console.log(`Video:  ${path.basename(VIDEO_PATH)}`);
console.log(`Region: ${REGION}\n`);

const videoSource = `file:${VIDEO_PATH}`;
const child = spawn(CPP_BINARY, [REGION, videoSource, API_KEY]);

const detections = [];

child.stdout.on("data", (data) => {
  const lines = data.toString().split("\n");
  for (const line of lines) {
    // Parse the C++ output
    if (line.includes("Plate text:")) {
      detections.push({ plate: line.split("Plate text:")[1].trim() });
    }
    if (line.includes("Country:") && detections.length > 0) {
      detections[detections.length - 1].country = line
        .split("Country:")[1]
        .trim();
    }
    if (line.includes("Make:") && detections.length > 0) {
      detections[detections.length - 1].make = line.split("Make:")[1].trim();
    }
    if (line.includes("Model:") && detections.length > 0) {
      detections[detections.length - 1].model = line.split("Model:")[1].trim();
    }
    if (line.includes("Color:") && detections.length > 0) {
      detections[detections.length - 1].color = line.split("Color:")[1].trim();
    }
    if (
      line.includes("Category:") &&
      detections.length > 0 &&
      !line.includes("PICK")
    ) {
      detections[detections.length - 1].category = line
        .split("Category:")[1]
        .trim();
    }

    // Print status changes
    if (line.includes("status changed")) {
      console.log(`  [Status] ${line.trim()}`);
    }
  }
});

child.stderr.on("data", (data) => {
  console.error(`  [Error] ${data.toString().trim()}`);
});

child.on("close", (code) => {
  console.log("\n══════════════════════════════════════════════");
  console.log(`  Detected ${detections.length} vehicles:\n`);

  for (const d of detections) {
    console.log(`  🚗 Plate: ${d.plate} | Country: ${d.country || "?"}`);
    if (d.make) console.log(`     Make: ${d.make} | Model: ${d.model || "?"}`);
    if (d.color)
      console.log(`     Color: ${d.color} | Type: ${d.category || "?"}`);
    console.log("");
  }

  console.log("══════════════════════════════════════════════");

  // Return JSON for programmatic use
  if (process.env.JSON_OUTPUT) {
    console.log(JSON.stringify(detections, null, 2));
  }
});

// Auto-quit after processing finishes (send 'q' when stream is done)
setTimeout(() => {
  child.stdin.write("q\n");
}, 60000); // 60s timeout

child.stdout.on("data", (data) => {
  if (data.toString().includes("FINISHED")) {
    setTimeout(() => child.stdin.write("q\n"), 2000);
  }
});
