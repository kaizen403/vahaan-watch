const {
  plateHash,
  encryptPlate,
  decryptPlate,
  normalizePlate,
} = require("./crypto");

async function saveDetection(collection, detection, options = {}) {
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
    detectedAt: new Date(),
  };

  await collection.insertOne(doc);

  return {
    plate: normalizedPlate,
    isBlacklisted: doc.isBlacklisted,
    detectedAt: doc.detectedAt,
  };
}

async function getRecentDetections(collection, limit = 100) {
  const docs = await collection
    .find({}, { projection: { _id: 0, plateHash: 0 } })
    .sort({ detectedAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map((doc) => ({
    ...doc,
    plate: decryptPlate(doc.encryptedPlate),
  }));
}

module.exports = {
  saveDetection,
  getRecentDetections,
};
