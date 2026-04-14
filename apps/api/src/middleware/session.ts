import type { MiddlewareHandler } from "hono";
import type { AppBindings } from "../types.js";
import { auth } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { fail } from "../utils/json.js";
import { hashToken } from "../utils/crypto.js";

export const sessionContext: MiddlewareHandler<AppBindings> = async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (session?.user) {
    c.set("user", {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      username: session.user.username ?? null,
      role: session.user.role ?? "operator",
    });
    c.set("session", session.session);
    c.set("device", null);
    return next();
  }

  const deviceTokenHeader = c.req.header("x-device-token");
  if (deviceTokenHeader) {
    const tokenHash = hashToken(deviceTokenHeader);
    const deviceToken = await prisma.deviceToken.findFirst({
      where: { tokenHash, revokedAt: null },
      include: { workstation: true },
    });

    if (deviceToken?.workstation) {
      c.set("user", {
        id: `device:${deviceToken.workstation.id}`,
        email: `device:${deviceToken.workstation.deviceId}`,
        name: deviceToken.workstation.name,
        username: deviceToken.workstation.address,
        role: "device",
      });
      c.set("session", null);
      c.set("device", {
        token: {
          id: deviceToken.id,
          label: deviceToken.label,
          deviceType: deviceToken.deviceType,
          workstationId: deviceToken.workstationId,
          tabletId: deviceToken.tabletId,
        },
        workstation: deviceToken.workstation,
        tablet: null,
        deviceKey: deviceToken.workstation.deviceId,
      });
      return next();
    }
  }

  c.set("user", null);
  c.set("session", null);
  c.set("device", null);
  await next();
};

export const requireUser: MiddlewareHandler<AppBindings> = async (c, next) => {
  if (!c.get("user")) {
    return fail(c, 401, "Authentication required.");
  }

  await next();
};

export function requireRole(...roles: string[]): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) {
      return fail(c, 401, "Authentication required.");
    }

    if (!roles.includes(user.role)) {
      return fail(c, 403, "Insufficient role for this action.");
    }

    await next();
  };
}
