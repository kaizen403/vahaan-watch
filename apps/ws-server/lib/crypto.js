const crypto = require("crypto");

function normalizePlate(plate) {
  return String(plate || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function getEncryptionKey() {
  const raw = process.env.PLATE_ENCRYPTION_KEY || "dev-only-change-this-key";
  return crypto.createHash("sha256").update(raw).digest();
}

function plateHash(plate) {
  const normalized = normalizePlate(plate);
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function encryptPlate(plate) {
  const normalized = normalizePlate(plate);
  const iv = crypto.randomBytes(12);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(normalized, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptPlate(payload) {
  const [ivB64, tagB64, dataB64] = String(payload || "").split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted plate payload");
  }

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

module.exports = {
  normalizePlate,
  plateHash,
  encryptPlate,
  decryptPlate,
};
