import { prisma } from "./prisma.js";
import type { DeviceContext, SessionUser } from "../types.js";

type Jsonish = string | number | boolean | Jsonish[] | { [key: string]: Jsonish };

interface AuditInput {
  actorUser?: SessionUser | null;
  actorDevice?: DeviceContext | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Jsonish;
}

export async function writeAuditLog(input: AuditInput) {
  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUser?.role === "device" ? null : input.actorUser?.id,
      actorDeviceType: input.actorDevice?.token.deviceType,
      actorDeviceId: input.actorDevice?.deviceKey,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
    },
  });
}
