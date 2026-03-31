const {
  plateHash,
  encryptPlate,
  decryptPlate,
  normalizePlate,
} = require("./crypto");
const { tableRef } = require("./db");

const DUMMY_BLACKLIST = [
  { plate: "KA01AB1234", reason: "Stolen vehicle (dummy)", riskLevel: "high" },
  { plate: "TN09XY0001", reason: "Fraud watchlist (dummy)", riskLevel: "medium" },
  { plate: "DL8CAF5030", reason: "Police flag (dummy)", riskLevel: "high" },
];

async function seedDummyBlacklist(db, tableName) {
  const countRes = await db.query(`SELECT COUNT(*)::int AS count FROM ${tableRef(tableName)}`);
  if (countRes.rows[0].count > 0) return { inserted: 0, skipped: true };

  let inserted = 0;
  for (const row of DUMMY_BLACKLIST) {
    const res = await db.query(
      `
        INSERT INTO ${tableRef(tableName)}
          (plate_hash, encrypted_plate, reason, risk_level, source, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (plate_hash) DO NOTHING
      `,
      [
        plateHash(row.plate),
        encryptPlate(row.plate),
        row.reason,
        row.riskLevel,
        "seed",
      ]
    );
    inserted += res.rowCount || 0;
  }

  return { inserted, skipped: false };
}

async function getBlacklistedPlates(db, tableName, limit = 50) {
  const { rows } = await db.query(
    `
      SELECT encrypted_plate, reason, risk_level, source, created_at
      FROM ${tableRef(tableName)}
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [limit]
  );

  return rows.map((doc) => ({
    encryptedPlate: doc.encrypted_plate,
    reason: doc.reason,
    riskLevel: doc.risk_level,
    source: doc.source,
    createdAt: doc.created_at,
    plate: decryptPlate(doc.encrypted_plate),
  }));
}

async function isPlateBlacklisted(db, tableName, plate) {
  const normalized = normalizePlate(plate);
  if (!normalized) {
    return { isBlacklisted: false, normalizedPlate: normalized, record: null };
  }

  const { rows } = await db.query(
    `
      SELECT encrypted_plate, reason, risk_level, source, created_at
      FROM ${tableRef(tableName)}
      WHERE plate_hash = $1
      LIMIT 1
    `,
    [plateHash(normalized)]
  );
  const doc = rows[0];

  if (!doc) {
    return { isBlacklisted: false, normalizedPlate: normalized, record: null };
  }

  return {
    isBlacklisted: true,
    normalizedPlate: normalized,
    record: {
      plate: decryptPlate(doc.encrypted_plate),
      reason: doc.reason,
      riskLevel: doc.risk_level,
      source: doc.source,
      createdAt: doc.created_at,
    },
  };
}

module.exports = {
  seedDummyBlacklist,
  getBlacklistedPlates,
  isPlateBlacklisted,
};
