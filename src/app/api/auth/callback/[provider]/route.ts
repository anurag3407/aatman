import type { NextRequest } from "next/server";
import { evaluateIdentity } from "@/lib/auth/identity";
import { createSessionFor, landingPathFor, loginRedirect } from "@/lib/auth/login";
import { finishLogin, type PendingLogin } from "@/lib/auth/oidc";
import { verifyTemp } from "@/lib/auth/session";
import { CONSENT_COOKIE } from "@/lib/consent";
import { env } from "@/lib/env";
import { redirectTo } from "@/lib/http";

const OIDC_COOKIE = "aat_o";

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const pending = (await verifyTemp(req.cookies.get(OIDC_COOKIE)?.value)) as PendingLogin | null;
  if (!pending || pending.provider !== provider) return redirectTo("/signin?error=failed");

  // Rebuild the callback URL from APP_URL: behind a proxy, req.url may hold the internal host.
  const callbackUrl = new URL(`/api/auth/callback/${provider}${req.nextUrl.search}`, env().APP_URL);

  try {
    const claims = await finishLogin(pending, callbackUrl);
    const e = env();
    const identity = evaluateIdentity(pending.provider, claims, {
      allowedDomains: e.ALLOWED_EMAIL_DOMAINS,
      microsoftTenantId: e.MICROSOFT_TENANT_ID,
      counsellorEmails: e.COUNSELLOR_EMAILS,
      adminEmails: e.ADMIN_EMAILS,
    });
    if (!identity.ok) return redirectTo(`/signin?error=${identity.reason}`);

    const session = await createSessionFor(identity.email, identity.role, {
      consentVersion: req.cookies.get(CONSENT_COOKIE)?.value,
    });
    const res = await loginRedirect(session, landingPathFor(session.role));
    res.cookies.delete({ name: OIDC_COOKIE, path: "/api/auth/callback" });
    return res;
  } catch (err) {
    console.error("[auth] callback failed", err instanceof Error ? err.message : err);
    return redirectTo("/signin?error=failed");
  }
}
