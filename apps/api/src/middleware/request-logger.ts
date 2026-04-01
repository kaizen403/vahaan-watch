import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import type { AppBindings } from "../types.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("http");

export const requestLogger: MiddlewareHandler<AppBindings> = async (c, next) => {
  const requestId = randomUUID();
  const start = Date.now();

  c.header("x-request-id", requestId);

  const method = c.req.method;
  const path = c.req.path;

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  const logData = {
    requestId,
    method,
    path,
    status,
    duration,
    userAgent: c.req.header("user-agent") ?? undefined,
    ip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? undefined,
  };

  if (status >= 500) {
    logger.error(logData, "request failed");
  } else if (status >= 400) {
    logger.warn(logData, "request error");
  } else {
    logger.info(logData, "request completed");
  }
};
