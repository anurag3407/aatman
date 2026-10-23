import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { roleFor } from "./identity";

/**
 * Stateless session in a signed, httpOnly cookie.
 * Students: `sub` is the pseudonym and no email is kept. Staff: `email` is kept so actions
 * can be attributed in the audit log.
 */

export type Role = "student" | "counsellor" | "admin";

export interface Session {
  sub: string;
  role: Role;
  email?: string;
}

// Neutral names: cookie lists in browser settings shouldn't reveal what the app is.
export const SESSION_COOKIE = "aat_s";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function secret(): Uint8Array {
  return new TextEncoder().encode(env().SESSION_SECRET);
}

export async function signSession(session: Session, ttlSeconds = SESSION_TTL_SECONDS): Promise<string> {
  return new SignJWT({ role: session.role, ...(session.email ? { email: session.email } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    const role = payload.role;
    if (typeof payload.sub !== "string" || (role !== "student" && role !== "counsellor" && role !== "admin")) {
      return null;
    }
    return { sub: payload.sub, role, ...(typeof payload.email === "string" ? { email: payload.email } : {}) };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  // Staff access ends as soon as the email leaves COUNSELLOR_EMAILS / ADMIN_EMAILS, not when the cookie expires.
  if (session && session.role !== "student") {
    const e = env();
    const current = session.email ? roleFor(session.email, { counsellorEmails: e.COUNSELLOR_EMAILS, adminEmails: e.ADMIN_EMAILS }) : null;
    if (current !== session.role) return null;
  }
  return session;
}

/** Short-lived signed payloads, e.g. OIDC state carried across the redirect. */
export async function signTemp(payload: Record<string, string>, ttlSeconds: number): Promise<string> {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${ttlSeconds}s`).sign(secret());
}

export async function verifyTemp(token: string | undefined): Promise<Record<string, unknown> | null> {
  if (!token) return null;
  try {
    return (await jwtVerify(token, secret(), { algorithms: ["HS256"] })).payload;
  } catch {
    return null;
  }
}
