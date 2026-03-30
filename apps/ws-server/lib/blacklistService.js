const {
  plateHash,
  encryptPlate,
  decryptPlate,
  normalizePlate,
} = require("./crypto");

const DUMMY_BLACKLIST = [
  { plate: "KA01AB1234", reason: "Stolen vehicle (dummy)", riskLevel: "high" },
  { plate: "TN09XY0001", reason: "Fraud watchlist (dummy)", riskLevel: "medium" },
  { plate: "DL8CAF5030", reason: "Police flag (dummy)", riskLevel: "high" },
];

async function seedDummyBlacklist(collection) {
  const count = await collection.countDocuments();
  if (count > 0) return { inserted: 0, skipped: true };

  const docs = DUMMY_BLACKLIST.map((row) => ({
    plateHash: plateHash(row.plate),
    encryptedPlate: encryptPlate(row.plate),
    reason: row.reason,
    riskLevel: row.riskLevel,
    source: "seed",
    createdAt: new Date(),
  }));

  const result = await collection.insertMany(docs, { ordered: false });
  return { inserted: result.insertedCount, skipped: false };
}

async function getBlacklistedPlates(collection, limit = 50) {
  const docs = await collection
    .find({}, { projection: { _id: 0, plateHash: 0 } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map((doc) => ({
    ...doc,
    plate: decryptPlate(doc.encryptedPlate),
  }));
}

async function isPlateBlacklisted(collection, plate) {
  const normalized = normalizePlate(plate);
  if (!normalized) {
    return { isBlacklisted: false, normalizedPlate: normalized, record: null };
  }

  const doc = await collection.findOne(
    { plateHash: plateHash(normalized) },
    { projection: { _id: 0 } }
  );

  if (!doc) {
    return { isBlacklisted: false, normalizedPlate: normalized, record: null };
  }

  return {
    isBlacklisted: true,
    normalizedPlate: normalized,
    record: {
      plate: decryptPlate(doc.encryptedPlate),
      reason: doc.reason,
      riskLevel: doc.riskLevel,
      source: doc.source,
      createdAt: doc.createdAt,
    },
  };
}

module.exports = {
  seedDummyBlacklist,
  getBlacklistedPlates,
  isPlateBlacklisted,
};
