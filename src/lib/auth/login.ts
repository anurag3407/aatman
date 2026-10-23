import "server-only";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { CONSENT_COOKIE, CONSENT_VERSION } from "@/lib/consent";
import { getDb, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { pseudonymize } from "@/lib/privacy/server";
import { recordAudit } from "@/lib/services/audit";
import { SESSION_COOKIE, sessionCookieOptions, signSession, type Role, type Session } from "./session";

/**
 * Turns a verified institute email into a session. For students the email is
 * pseudonymised here and goes no further: it isn't stored, logged or put in the cookie.
 */
export async function createSessionFor(
  email: string,
  role: Role,
  opts: { consentVersion?: string | null } = {},
): Promise<Session> {
  if (role !== "student") {
    await recordAudit(email, "staff_login");
    return { sub: `staff:${email}`, role, email };
  }

  const pseudonym = pseudonymize(email);
  const db = await getDb();
  await db.insert(schema.students).values({ pseudonym }).onConflictDoNothing();
  if (opts.consentVersion === CONSENT_VERSION) {
    await db
      .update(schema.students)
      .set({ consentVersion: CONSENT_VERSION, consentAt: new Date() })
      .where(eq(schema.students.pseudonym, pseudonym));
  }
  return { sub: pseudonym, role: "student" };
}

/** Redirect after login, setting the session cookie and clearing the one-time consent cookie. */
export async function loginRedirect(session: Session, path: string, host?: string): Promise<NextResponse> {
  const base = host ? (host.startsWith("http") ? host : `https://${host}`) : env().APP_URL;
  const res = NextResponse.redirect(new URL(path, base), 303);
  res.cookies.set(SESSION_COOKIE, await signSession(session), sessionCookieOptions());
  res.cookies.delete(CONSENT_COOKIE);
  return res;
}

export function landingPathFor(role: Role): string {
  if (role === "admin") return "/admin";
  if (role === "counsellor") return "/counsellor";
  return "/checkin";
}
