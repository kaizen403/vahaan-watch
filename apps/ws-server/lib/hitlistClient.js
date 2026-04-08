const CENTRAL_API_URL = process.env.CENTRAL_API_URL ?? "";
const DEVICE_TOKEN = process.env.DEVICE_TOKEN ?? "";
const HITLIST_ID = process.env.HITLIST_ID ?? "";
let hitlistPlates = new Set();
let hitlistInterval = null;

async function refreshHitlistCache() {
  if (!CENTRAL_API_URL || !DEVICE_TOKEN || !HITLIST_ID) return;
  try {
    const resp = await fetch(
      `${CENTRAL_API_URL}/api/sync/hitlists/${HITLIST_ID}`,
      {
        headers: { "x-device-token": DEVICE_TOKEN },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!resp.ok) return;
    const data = await resp.json();
    const entries = data.version?.entries ?? [];
    hitlistPlates = new Set(entries.map((e) => e.plateNormalized));
  } catch {
    // network failure — keep using cached plates
  }
}

function isInMainHitlist(plateNormalized) {
  return hitlistPlates.has(plateNormalized);
}

function startHitlistPolling() {
  if (hitlistInterval) return;
  void refreshHitlistCache();
  hitlistInterval = setInterval(() => { refreshHitlistCache(); }, 60_000);
}

function stopHitlistPolling() {
  if (!hitlistInterval) return;
  clearInterval(hitlistInterval);
  hitlistInterval = null;
}

module.exports = {
  refreshHitlistCache,
  isInMainHitlist,
  startHitlistPolling,
  stopHitlistPolling,
};
