import type { MiddlewareHandler } from "hono";
import type { AppBindings } from "../types.js";

export const securityHeaders: MiddlewareHandler<AppBindings> = async (c, next) => {
  await next();

  c.header("X-Frame-Options", "DENY");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-XSS-Protection", "0");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  c.header(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'",
  );
};

export function bodyLimit(maxBytes: number): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const contentLength = c.req.header("content-length");
    if (contentLength && Number(contentLength) > maxBytes) {
      return c.json(
        { success: false, error: "Request body too large." },
        413 as never,
      );
    }
    await next();
  };
}
