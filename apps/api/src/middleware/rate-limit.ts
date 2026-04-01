import type { MiddlewareHandler } from "hono";
import type { AppBindings } from "../types.js";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  max: number;
  windowMs: number;
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler<AppBindings> {
  const store = new Map<string, RateLimitEntry>();

  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) {
        store.delete(key);
      }
    }
  }, options.windowMs * 2);

  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return async (c, next) => {
    const clientIp =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown";

    const key = `${clientIp}:${c.req.path}`;
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + options.windowMs });
      await next();
      return;
    }

    entry.count += 1;

    if (entry.count > options.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json(
        { success: false, error: "Too many requests. Try again later." },
        429 as never,
      );
    }

    await next();
  };
}
