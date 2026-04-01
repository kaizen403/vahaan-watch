import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { config } from "./lib/env.js";
import { createLogger } from "./lib/logger.js";
import { startOutboxProcessor } from "./lib/outbox-processor.js";

const logger = createLogger("server");
const app = createApp();

serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    logger.info({ port: info.port, env: config.nodeEnv }, "apps/api started");
    startOutboxProcessor();
  },
);
