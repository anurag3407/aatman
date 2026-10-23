/**
 * Bump when the consent text in `messages/*.ts` (consent.*) changes materially.
 * Students on an older version are asked to consent again before their next check-in.
 */
export const CONSENT_VERSION = "2026-10-v1";

/** Set by the consent screen before sign-in, read once by the login callback. */
export const CONSENT_COOKIE = "aat_c";
