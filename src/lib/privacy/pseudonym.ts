import { createHmac } from "node:crypto";

/**
 * HMAC-SHA256(key, normalised email). A keyed hash, not a plain one: roll numbers and
 * institute emails are guessable, so without the key nobody can recompute or reverse it.
 * This is pseudonymous, not anonymous. Whoever holds the key can link an email to its
 * data, so keep the key in a secrets manager, away from DB backups.
 */
export function pseudonymFor(email: string, key: string): string {
  const normalised = email.trim().toLowerCase();
  return "p_" + createHmac("sha256", key).update(normalised).digest("base64url");
}
