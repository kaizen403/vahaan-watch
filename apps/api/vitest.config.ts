import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// env must be in process.env before test modules import lib/env.ts
const raw = readFileSync(resolve(import.meta.dirname!, ".env"), "utf-8");
for (const line of raw.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq > 0) process.env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
}

export default defineConfig({});
