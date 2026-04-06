import type { PrismaClient } from "@prisma/client";
import type { MiddlewareHandler } from "hono";
import type { AppBindings } from "../types.js";

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  public async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const now = Date.now();
    const existing = this.entries.get(key);
    if (existing && existing.resetAt > now) {
      existing.count += 1;
      return existing;
    }
    const entry = { count: 1, resetAt: now + windowMs };
    this.entries.set(key, entry);
    return entry;
  }
}

export class PostgresRateLimitStore implements RateLimitStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const now = new Date();
    const resetAt = new Date(now.getTime() + windowMs);

    await this.prisma.$executeRaw`
      INSERT INTO rate_limit_entries (key, count, reset_at)
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT (key) DO UPDATE SET
        count = CASE
          WHEN rate_limit_entries.reset_at <= ${now} THEN 1
          ELSE rate_limit_entries.count + 1
        END,
        reset_at = CASE
          WHEN rate_limit_entries.reset_at <= ${now} THEN ${resetAt}
          ELSE rate_limit_entries.reset_at
        END
    `;

    const result = await this.prisma.$queryRaw<Array<{ count: number; reset_at: Date }>>`
      SELECT count, reset_at FROM rate_limit_entries WHERE key = ${key}
    `;

    const entry = result[0];
    return {
      count: Number(entry.count),
      resetAt: entry.reset_at.getTime(),
    };
  }
}

interface RateLimitOptions {
  max: number;
  windowMs: number;
  store?: RateLimitStore;
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler<AppBindings> {
  const store = options.store ?? new MemoryRateLimitStore();

  return async (c, next) => {
    const clientIp =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown";

    const key = `${clientIp}:${c.req.path}`;
    const now = Date.now();
    const entry = await store.increment(key, options.windowMs);

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
