const STALE_THRESHOLD_MS = 2 * 60 * 1000;

export function computeEffectiveStatus(
  dbStatus: string,
  lastSeenAt: Date | string | null,
  now = Date.now(),
): string {
  if (lastSeenAt) {
    const ts = lastSeenAt instanceof Date ? lastSeenAt.getTime() : new Date(lastSeenAt).getTime();
    return now - ts <= STALE_THRESHOLD_MS ? "ACTIVE" : "OFFLINE";
  }

  if (dbStatus === "ACTIVE") return "OFFLINE";

  return dbStatus;
}
