import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "./env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENCODING = "base64" as const;

/**
 * Derives a 32-byte key from the configured FIELD_ENCRYPTION_KEY.
 * The key must be exactly 64 hex characters (32 bytes).
 */
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

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string: iv + authTag + ciphertext.
 */
export function encryptField(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack: iv (12) + authTag (16) + ciphertext (variable)
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString(ENCODING);
}

/**
 * Decrypts a base64-encoded ciphertext produced by encryptField.
 * Returns the original plaintext string.
 */
export function decryptField(encoded: string): string {
  const key = getKey();
  const packed = Buffer.from(encoded, ENCODING);

  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted field: too short.");
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Encrypts a value if non-null, passes null through unchanged.
 */
export function encryptOptional(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return encryptField(value);
}

/**
 * Decrypts a value if non-null, passes null through unchanged.
 */
export function decryptOptional(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  try {
    return decryptField(value);
  } catch {
    // Return as-is if decryption fails (unencrypted legacy data).
    return value;
  }
}
