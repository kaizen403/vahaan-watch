const {
  plateHash,
  encryptPlate,
  decryptPlate,
  normalizePlate,
} = require("./crypto");
const { tableRef } = require("./db");

async function saveDetection(db, tableName, detection, options = {}) {
  const normalizedPlate = normalizePlate(detection.plate);

  const doc = {
    sessionId: options.sessionId || null,
    batchNum: options.batchNum || null,
    region: options.region || null,
    timestamp: detection.timestamp || "",
    plateHash: plateHash(normalizedPlate),
    encryptedPlate: encryptPlate(normalizedPlate),
    country: detection.country || "",
    make: detection.make || "",
    model: detection.model || "",
    color: detection.color || "",
    category: detection.category || "",
    isBlacklisted: Boolean(options.blacklist?.isBlacklisted),
    blacklistReason: options.blacklist?.record?.reason || null,
    riskLevel: options.blacklist?.record?.riskLevel || null,
  };

  await db.query(
    `
      INSERT INTO ${tableRef(tableName)}
      (
        session_id, batch_num, region, timestamp,
        plate_hash, encrypted_plate,
        country, make, model, color, category,
        is_blacklisted, blacklist_reason, risk_level, detected_at
      )
      VALUES (
        $1, $2, $3, $4,
        $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, NOW()
      )
    `,
    [
      doc.sessionId,
      doc.batchNum,
      doc.region,
      doc.timestamp,
      doc.plateHash,
      doc.encryptedPlate,
      doc.country,
      doc.make,
      doc.model,
      doc.color,
      doc.category,
      doc.isBlacklisted,
      doc.blacklistReason,
      doc.riskLevel,
    ]
  );

  return {
    plate: normalizedPlate,
    isBlacklisted: doc.isBlacklisted,
    detectedAt: new Date(),
  };
}

async function getRecentDetections(db, tableName, limit = 100) {
  const { rows } = await db.query(
    `
      SELECT
        session_id, batch_num, region, timestamp,
        encrypted_plate,
        country, make, model, color, category,
        is_blacklisted, blacklist_reason, risk_level, detected_at
      FROM ${tableRef(tableName)}
      ORDER BY detected_at DESC
      LIMIT $1
    `,
    [limit]
  );

  return rows.map((doc) => ({
    sessionId: doc.session_id,
    batchNum: doc.batch_num,
    region: doc.region,
    timestamp: doc.timestamp,
    encryptedPlate: doc.encrypted_plate,
    country: doc.country,
    make: doc.make,
    model: doc.model,
    color: doc.color,
    category: doc.category,
    isBlacklisted: doc.is_blacklisted,
    blacklistReason: doc.blacklist_reason,
    riskLevel: doc.risk_level,
    detectedAt: doc.detected_at,
    plate: decryptPlate(doc.encrypted_plate),
  }));
}

module.exports = {
  saveDetection,
  getRecentDetections,
};
