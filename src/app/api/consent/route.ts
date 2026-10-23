import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { CONSENT_COOKIE, CONSENT_VERSION } from "@/lib/consent";
import { env } from "@/lib/env";
import { forbiddenOrigin, isSameOrigin, redirectTo } from "@/lib/http";
import { recordConsent } from "@/lib/services/studentData";

/**
 * Signed-in students: record consent now. Everyone else: carry it across sign-in in a
 * short-lived cookie that the login callback records against the new pseudonym.
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  const session = await getSession();

  if (session?.role === "student") {
    await recordConsent(session.sub);
    return redirectTo("/checkin");
  }

  const res = redirectTo("/signin");
  res.cookies.set(CONSENT_COOKIE, CONSENT_VERSION, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 60,
  });
  return res;
}
