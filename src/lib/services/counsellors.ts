import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { recordAudit } from "./audit";

export interface CounsellorProfile {
  email: string;
  displayName: string;
  languages: string;
  bio: string | null;
  active: boolean;
  updatedAt: Date;
}

export interface CounsellorInput {
  email: string;
  displayName: string;
  languages: string;
  bio?: string;
}

export async function upsertCounsellor(input: CounsellorInput, actor: string): Promise<void> {
  const displayName = input.displayName.trim().slice(0, 80);
  if (!displayName) throw new Error("display name is required");
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("invalid email");
  const languages = input.languages.trim().slice(0, 160);
  const bio = input.bio?.trim().slice(0, 600) || null;

  const db = await getDb();
  await db
    .insert(schema.counsellors)
    .values({ email, displayName, languages, bio })
    .onConflictDoUpdate({
      target: schema.counsellors.email,
      set: { displayName, languages, bio, updatedAt: new Date() },
    });
  await recordAudit(actor, "update_counsellor", "counsellor", email);
}

export async function getCounsellor(email: string): Promise<CounsellorProfile | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.counsellors).where(eq(schema.counsellors.email, email));
  return row ?? null;
}

export async function listCounsellors(): Promise<CounsellorProfile[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.counsellors)
    .orderBy(asc(schema.counsellors.displayName), asc(schema.counsellors.email));
}
