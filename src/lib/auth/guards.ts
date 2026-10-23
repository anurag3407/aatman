import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { CONSENT_VERSION } from "@/lib/consent";
import { getDb, schema } from "@/lib/db";
import { landingPathFor } from "./login";
import { getSession, type Role, type Session } from "./session";

/** Server components: a signed-in student who has accepted the current consent version. */
export async function requireStudentPage(): Promise<Session> {
  const session = await getSession();
  if (!session || session.role !== "student") redirect("/signin");
  if (!(await hasCurrentConsent(session.sub))) redirect("/consent");
  return session;
}

export async function requireStaffPage(roles: Role[] = ["counsellor", "admin"]): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (!roles.includes(session.role)) redirect(session.role === "student" ? "/" : landingPathFor(session.role));
  return session;
}

export async function hasCurrentConsent(pseudonym: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ v: schema.students.consentVersion })
    .from(schema.students)
    .where(eq(schema.students.pseudonym, pseudonym));
  return row?.v === CONSENT_VERSION;
}

export type ApiAuth = { session: Session; error?: never } | { session?: never; error: NextResponse };

/** Route handlers: returns the session, or a JSON error response to return as-is. */
export async function requireApi(roles: Role[], opts: { consent?: boolean } = {}): Promise<ApiAuth> {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  if (!roles.includes(session.role)) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  if (opts.consent && session.role === "student" && !(await hasCurrentConsent(session.sub))) {
    return { error: NextResponse.json({ error: "consent_required" }, { status: 403 }) };
  }
  return { session };
}
