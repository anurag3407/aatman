import "server-only";
import { env } from "@/lib/env";
import { decryptJson, encryptJson } from "./fieldCrypto";
import { pseudonymFor } from "./pseudonym";
import { scrubPii } from "./piiScrub";

/** Field encryption bound to the row owner's pseudonym. */
export function seal(value: unknown, ownerPseudonym: string): string {
  return encryptJson(value, ownerPseudonym, env().DATA_ENCRYPTION_KEY);
}

export function unseal<T>(encoded: string, ownerPseudonym: string): T {
  return decryptJson<T>(encoded, ownerPseudonym, env().DATA_ENCRYPTION_KEY);
}

export function pseudonymize(email: string): string {
  return pseudonymFor(email, env().PSEUDONYM_KEY);
}

export function scrubForLlm(text: string): string {
  return scrubPii(text, { hostelNames: env().HOSTEL_NAMES });
}
