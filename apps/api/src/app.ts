import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppBindings } from "./types.js";
import { config } from "./lib/env.js";
import { auth } from "./lib/auth.js";
import { healthRoutes } from "./routes/health.js";
import { deviceRoutes } from "./routes/devices.js";
import { hitlistRoutes } from "./routes/hitlists.js";
import { ingestRoutes } from "./routes/ingest.js";
import { matchEventRoutes } from "./routes/match-events.js";
import { metricsRoutes } from "./routes/metrics.js";
import { eventRoutes } from "./routes/events.js";
import { telemetryRoutes } from "./routes/telemetry.js";
import { syncRoutes } from "./routes/sync.js";
import { portalScanRoutes } from "./routes/portal-scan.js";
import { sessionContext, requireRole, requireUser } from "./middleware/session.js";
import { requireDevice } from "./middleware/device-auth.js";
import { securityHeaders, bodyLimit } from "./middleware/security.js";
import { requestLogger } from "./middleware/request-logger.js";
import { rateLimit } from "./middleware/rate-limit.js";

const ONE_MB = 1024 * 1024;
const authRateLimit = rateLimit({ max: 20, windowMs: 60_000 });
const deviceRegRateLimit = rateLimit({ max: 10, windowMs: 60_000 });

export function createApp() {
  const app = new Hono<AppBindings>();

  app.use("*", securityHeaders);
  app.use("*", bodyLimit(ONE_MB));
  app.use("*", requestLogger);
  app.use("*", cors({
    origin: config.trustedOrigins,
    credentials: true,
  }));
  app.use("*", sessionContext);

  app.on(["GET", "POST"], "/api/auth/*", authRateLimit, (c) => auth.handler(c.req.raw));

  app.route("/", healthRoutes);
  app.route("/", metricsRoutes);
  app.route("/", eventRoutes);

  app.use("/api/devices/register", deviceRegRateLimit);
  app.use("/api/devices", requireUser, requireRole("admin", "operator"));
  app.use("/api/devices/pairings", requireUser, requireRole("admin"));
  app.route("/", deviceRoutes);

  app.use("/api/hitlists", requireUser, requireRole("admin", "operator"));
  app.use("/api/hitlists/*", requireUser, requireRole("admin", "operator"));
  app.route("/", hitlistRoutes);

  app.use("/api/match-events", requireUser, requireRole("admin", "operator"));
  app.use("/api/match-events/*", requireUser, requireRole("admin", "operator"));
  app.route("/", matchEventRoutes);

  app.use("/api/portal/scan", requireUser, requireRole("admin", "operator", "scanner"));
  app.route("/", portalScanRoutes);

  app.use("/api/ingest/*", requireDevice);
  app.route("/", ingestRoutes);

  app.use("/api/telemetry/heartbeat", requireDevice);
  app.use("/api/telemetry/device/:deviceId", requireUser, requireRole("admin", "operator"));
  app.use("/api/devices/:deviceId/health", requireUser, requireRole("admin", "operator"));
  app.route("/", telemetryRoutes);

  app.use("/api/sync/hitlists/*", requireDevice);
  app.use("/api/sync/cursors", requireDevice);
  app.route("/", syncRoutes);

  app.get("/api/session", requireUser, (c) => {
    return c.json({
      success: true,
      data: {
        user: c.get("user"),
        session: c.get("session"),
      },
    });
  });

  return app;
}
