import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "./env.js";

// Current algorithm for all new writes.
const CHACHA20_ALGORITHM = "chacha20-poly1305";
// Legacy algorithm — kept to decrypt rows written before the ChaCha20 migration.
const LEGACY_AES_ALGORITHM = "aes-256-gcm";

const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENCODING = "base64" as const;
const CC20_PREFIX = "cc20:";

function getKey(): Buffer {
  const hex = config.fieldEncryptionKey;
  if (!hex) {
    throw new Error("FIELD_ENCRYPTION_KEY is not configured.");
  }
  if (hex.length !== 64) {
    throw new Error("FIELD_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).");
  }
  return Buffer.from(hex, "hex");
}

export function encryptField(plaintext: string): string {
  const key = getKey();
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = createCipheriv(CHACHA20_ALGORITHM, key, nonce, { authTagLength: AUTH_TAG_LENGTH });

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const packed = Buffer.concat([nonce, authTag, ciphertext]);
  return CC20_PREFIX + packed.toString(ENCODING);
}

export function decryptField(encoded: string): string {
  const key = getKey();

  if (encoded.startsWith(CC20_PREFIX)) {
    const packed = Buffer.from(encoded.slice(CC20_PREFIX.length), ENCODING);
    if (packed.length < NONCE_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error("Invalid encrypted field: too short.");
    }
    const nonce = packed.subarray(0, NONCE_LENGTH);
    const authTag = packed.subarray(NONCE_LENGTH, NONCE_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = packed.subarray(NONCE_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(CHACHA20_ALGORITHM, key, nonce, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }

  // AES-256-GCM legacy path for rows written before the migration.
  const packed = Buffer.from(encoded, ENCODING);
  if (packed.length < NONCE_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted field: too short.");
  }
  const iv = packed.subarray(0, NONCE_LENGTH);
  const authTag = packed.subarray(NONCE_LENGTH, NONCE_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(NONCE_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(LEGACY_AES_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function encryptOptional(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return encryptField(value);
}

export function decryptOptional(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  try {
    return decryptField(value);
  } catch {
    return value;
  }
}
