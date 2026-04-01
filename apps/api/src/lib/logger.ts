import pino from "pino";
import { config } from "./env.js";

export const rootLogger = pino({
  level: config.logLevel,
  transport:
    config.nodeEnv === "development"
      ? { target: "pino/file", options: { destination: 1 } }
      : undefined,
  base: { service: "apps/api" },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers[\"x-device-token\"]",
      "req.headers[\"x-provisioning-token\"]",
    ],
    censor: "[REDACTED]",
  },
});

export function createLogger(module: string) {
  return rootLogger.child({ module });
}
