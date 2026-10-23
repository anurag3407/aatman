import type { NextRequest } from "next/server";
import { roleFor } from "@/lib/auth/identity";
import { createSessionFor, landingPathFor, loginRedirect } from "@/lib/auth/login";
import { CONSENT_COOKIE } from "@/lib/consent";
import { devLoginEnabled, env } from "@/lib/env";
import { forbiddenOrigin, isSameOrigin, redirectTo } from "@/lib/http";

/** Local development and e2e tests only. `devLoginEnabled()` is always false in production. */
export async function POST(req: NextRequest) {
  if (!devLoginEnabled()) return new Response("Not found", { status: 404 });
  if (!isSameOrigin(req)) return forbiddenOrigin();

  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const e = env();
  if (!e.ALLOWED_EMAIL_DOMAINS.some((d) => email.endsWith(`@${d}`))) return redirectTo("/signin?error=wrong_domain");

  const role = roleFor(email, { counsellorEmails: e.COUNSELLOR_EMAILS, adminEmails: e.ADMIN_EMAILS });
  const session = await createSessionFor(email, role, { consentVersion: req.cookies.get(CONSENT_COOKIE)?.value });
  return loginRedirect(session, landingPathFor(role));
}
