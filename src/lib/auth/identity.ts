import type { Role } from "./session";

/**
 * Pure identity rules, kept separate from the OIDC plumbing so they're unit-tested.
 */

export type Provider = "google" | "microsoft";

/** ID-token claims used: email, email_verified, preferred_username, hd (Google Workspace domain), tid (Entra tenant). */
export type IdentityClaims = Record<string, unknown>;

export type IdentityResult =
  | { ok: true; email: string; role: Role }
  | { ok: false; reason: "no_email" | "unverified" | "wrong_domain" | "wrong_tenant" };

export interface IdentityPolicy {
  allowedDomains: readonly string[];
  microsoftTenantId?: string;
  counsellorEmails: readonly string[];
  adminEmails: readonly string[];
}

function domainOf(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1);
}

export function evaluateIdentity(provider: Provider, claims: IdentityClaims, policy: IdentityPolicy): IdentityResult {
  const rawEmail =
    typeof claims.email === "string"
      ? claims.email
      : provider === "microsoft" && typeof claims.preferred_username === "string"
        ? claims.preferred_username
        : undefined;
  if (!rawEmail || !rawEmail.includes("@")) return { ok: false, reason: "no_email" };
  const email = rawEmail.trim().toLowerCase();
  const domain = domainOf(email);

  if (provider === "google") {
    if (claims.email_verified !== true) return { ok: false, reason: "unverified" };
    // `hd` proves the account is managed by the institute's Workspace, not a personal Gmail.
    if (typeof claims.hd !== "string" || !policy.allowedDomains.includes(claims.hd.toLowerCase())) {
      return { ok: false, reason: "wrong_domain" };
    }
  } else {
    if (!policy.microsoftTenantId || claims.tid !== policy.microsoftTenantId) return { ok: false, reason: "wrong_tenant" };
  }

  if (!policy.allowedDomains.includes(domain)) return { ok: false, reason: "wrong_domain" };

  return { ok: true, email, role: roleFor(email, policy) };
}

export function roleFor(email: string, policy: Pick<IdentityPolicy, "counsellorEmails" | "adminEmails">): Role {
  const e = email.toLowerCase();
  if (policy.adminEmails.includes(e)) return "admin";
  if (policy.counsellorEmails.includes(e)) return "counsellor";
  return "student";
}
