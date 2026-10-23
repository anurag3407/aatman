import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { CONSENT_VERSION } from "@/lib/consent";
import { getDb, schema } from "@/lib/db";
import { unseal } from "@/lib/privacy/server";
import { recordAudit } from "./audit";
import { listCheckins } from "./checkins";
import type { ContactDetails } from "./contactRequests";

/** DPDP right of access: everything stored for this pseudonym, decrypted. */
export async function exportStudentData(pseudonym: string) {
  const db = await getDb();
  const [student] = await db.select().from(schema.students).where(eq(schema.students.pseudonym, pseudonym));
  const requests = await db.select().from(schema.contactRequests).where(eq(schema.contactRequests.pseudonym, pseudonym));
  const bookings = await db.select().from(schema.slots).where(eq(schema.slots.bookedBy, pseudonym));

  return {
    exportedAt: new Date().toISOString(),
    account: student
      ? { pseudonym: student.pseudonym, createdAt: student.createdAt, consentVersion: student.consentVersion, consentAt: student.consentAt }
      : null,
    checkins: (await listCheckins(pseudonym)).map((c) => ({
      id: c.id,
      createdAt: c.createdAt,
      tier: c.triage.tier,
      answers: c.answers,
      campus: c.campus,
      scores: c.triage.scores,
      summary: c.summary?.text ?? null,
      keep: c.keep,
    })),
    contactRequests: requests.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      status: r.status,
      contact: unseal<ContactDetails>(r.contactEnc, pseudonym),
    })),
    bookings: bookings.map((b) => ({
      id: b.id,
      startsAt: b.startsAt,
      location: b.location,
      mode: b.mode,
      status: b.status,
      sharedCheckin: b.sharedCheckinId !== null,
    })),
  };
}

/**
 * DPDP right to erasure. Future bookings go back to the pool, then the student row is
 * deleted; check-ins and contact requests cascade with it.
 */
export async function eraseStudent(pseudonym: string, now = new Date()): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(schema.slots)
      .set({ status: "open", bookedBy: null, bookedAt: null, sharedCheckinId: null, contactEnc: null })
      .where(and(eq(schema.slots.bookedBy, pseudonym), eq(schema.slots.status, "booked"), gt(schema.slots.startsAt, now)));
    await tx
      .update(schema.slots)
      .set({ bookedBy: null, sharedCheckinId: null, contactEnc: null })
      .where(eq(schema.slots.bookedBy, pseudonym));
    await tx.delete(schema.students).where(eq(schema.students.pseudonym, pseudonym));
  });
  // No identifier: the audit trail records that an erasure happened, not whose.
  await recordAudit("student", "student_erased");
}

export async function recordConsent(pseudonym: string): Promise<void> {
  const db = await getDb();
  await db.insert(schema.students).values({ pseudonym }).onConflictDoNothing();
  await db
    .update(schema.students)
    .set({ consentVersion: CONSENT_VERSION, consentAt: new Date() })
    .where(eq(schema.students.pseudonym, pseudonym));
}
