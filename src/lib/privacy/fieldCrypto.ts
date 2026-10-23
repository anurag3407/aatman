import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for individual DB fields. Format: `v1.<base64url(iv | ciphertext | tag)>`.
 * The owner's pseudonym is bound as additional authenticated data, so a ciphertext copied
 * onto another student's row fails to decrypt instead of leaking.
 */

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function keyBytes(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes");
  return key;
}

export function encryptJson(value: unknown, aad: string, keyBase64: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(keyBase64), iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `${VERSION}.${Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString("base64url")}`;
}

export function decryptJson<T>(encoded: string, aad: string, keyBase64: string): T {
  const [version, body] = encoded.split(".", 2);
  if (version !== VERSION || !body) throw new Error("Unknown ciphertext format");
  const raw = Buffer.from(body, "base64url");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(raw.length - TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES, raw.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(keyBase64), iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  return JSON.parse(plain) as T;
}
