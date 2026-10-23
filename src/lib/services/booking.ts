import "server-only";
import { and, asc, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { seal, unseal } from "@/lib/privacy/server";
import { recordAudit } from "./audit";
import { getCheckin, latestCheckin, type CheckinRecord } from "./checkins";

export const BOOKING_WINDOW_DAYS = 14;
export const MAX_UPCOMING_BOOKINGS = 2;

type SlotRow = typeof schema.slots.$inferSelect;
export type SlotMode = SlotRow["mode"];

export interface PublicSlot {
  id: string;
  startsAt: Date;
  endsAt: Date;
  location: string;
  mode: SlotMode;
}

const publicFields = {
  id: schema.slots.id,
  startsAt: schema.slots.startsAt,
  endsAt: schema.slots.endsAt,
  location: schema.slots.location,
  mode: schema.slots.mode,
};

export async function listOpenSlots(now = new Date()): Promise<PublicSlot[]> {
  const db = await getDb();
  const until = new Date(now.getTime() + BOOKING_WINDOW_DAYS * 86_400_000);
  return db
    .select(publicFields)
    .from(schema.slots)
    .where(and(eq(schema.slots.status, "open"), gt(schema.slots.startsAt, now), lt(schema.slots.startsAt, until)))
    .orderBy(asc(schema.slots.startsAt));
}

export async function listStudentBookings(pseudonym: string, now = new Date()) {
  const db = await getDb();
  return db
    .select({ ...publicFields, status: schema.slots.status })
    .from(schema.slots)
    .where(and(eq(schema.slots.bookedBy, pseudonym), gt(schema.slots.endsAt, now)))
    .orderBy(asc(schema.slots.startsAt));
}

export type BookResult = { ok: true } | { ok: false; error: "taken" | "too_many" | "no_checkin" };

export async function bookSlot(
  pseudonym: string,
  slotId: string,
  opts: { shareLatestCheckin: boolean; phone?: string },
  now = new Date(),
): Promise<BookResult> {
  const db = await getDb();
  const upcoming = await db
    .select({ id: schema.slots.id })
    .from(schema.slots)
    .where(and(eq(schema.slots.bookedBy, pseudonym), eq(schema.slots.status, "booked"), gt(schema.slots.startsAt, now)));
  if (upcoming.length >= MAX_UPCOMING_BOOKINGS) return { ok: false, error: "too_many" };

  let sharedCheckinId: string | null = null;
  if (opts.shareLatestCheckin) {
    const latest = await latestCheckin(pseudonym);
    if (!latest) return { ok: false, error: "no_checkin" };
    sharedCheckinId = latest.id;
  }

  // Conditional update: only one of two concurrent bookings can win.
  const won = await db
    .update(schema.slots)
    .set({
      status: "booked",
      bookedBy: pseudonym,
      bookedAt: now,
      sharedCheckinId,
      contactEnc: opts.phone ? seal({ phone: opts.phone }, pseudonym) : null,
    })
    .where(and(eq(schema.slots.id, slotId), eq(schema.slots.status, "open"), gt(schema.slots.startsAt, now)))
    .returning({ id: schema.slots.id });
  return won.length ? { ok: true } : { ok: false, error: "taken" };
}

export async function cancelBooking(pseudonym: string, slotId: string, now = new Date()): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .update(schema.slots)
    .set({ status: "open", bookedBy: null, bookedAt: null, sharedCheckinId: null, contactEnc: null })
    .where(
      and(
        eq(schema.slots.id, slotId),
        eq(schema.slots.bookedBy, pseudonym),
        eq(schema.slots.status, "booked"),
        gt(schema.slots.startsAt, now),
      ),
    )
    .returning({ id: schema.slots.id });
  return rows.length > 0;
}

// ── Staff ──────────────────────────────────────────────────────────────────────

export interface NewSlots {
  firstStart: Date;
  durationMinutes: number;
  /** How many back-to-back slots on that day. */
  perDay: number;
  /** Repeat weekly for this many weeks (1 = just this date). */
  weeks: number;
  location: string;
  mode: SlotMode;
}

export async function createSlots(counsellorEmail: string, spec: NewSlots): Promise<number> {
  const values: (typeof schema.slots.$inferInsert)[] = [];
  for (let w = 0; w < spec.weeks; w++) {
    for (let i = 0; i < spec.perDay; i++) {
      const start = new Date(spec.firstStart.getTime() + w * 7 * 86_400_000 + i * spec.durationMinutes * 60_000);
      values.push({
        counsellorEmail,
        startsAt: start,
        endsAt: new Date(start.getTime() + spec.durationMinutes * 60_000),
        location: spec.location,
        mode: spec.mode,
      });
    }
  }
  if (!values.length) return 0;
  const db = await getDb();
  await db.insert(schema.slots).values(values);
  await recordAudit(counsellorEmail, "create_slots", "slots", String(values.length));
  return values.length;
}

export async function listStaffSlots(now = new Date()) {
  const db = await getDb();
  const rows = await db
    .select({
      ...publicFields,
      status: schema.slots.status,
      counsellorEmail: schema.slots.counsellorEmail,
      booked: sql<boolean>`${schema.slots.bookedBy} is not null`,
      shared: sql<boolean>`${schema.slots.sharedCheckinId} is not null`,
    })
    .from(schema.slots)
    .where(and(gte(schema.slots.endsAt, now), inArray(schema.slots.status, ["open", "booked"])))
    .orderBy(asc(schema.slots.startsAt));
  return rows;
}

/** Counsellor cancels a slot. A booked student sees it as cancelled in their list. */
export async function cancelSlotAsStaff(slotId: string, actor: string): Promise<void> {
  const db = await getDb();
  await db.update(schema.slots).set({ status: "cancelled" }).where(eq(schema.slots.id, slotId));
  await recordAudit(actor, "cancel_slot", "slot", slotId);
}

export interface BookingDetail {
  slot: PublicSlot & { status: SlotRow["status"] };
  phone: string | null;
  checkin: CheckinRecord | null;
}

export async function getBookingForStaff(slotId: string, actor: string): Promise<BookingDetail | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.slots).where(eq(schema.slots.id, slotId));
  if (!row || !row.bookedBy) return null;
  await recordAudit(actor, "view_booking", "slot", slotId);
  return {
    slot: { id: row.id, startsAt: row.startsAt, endsAt: row.endsAt, location: row.location, mode: row.mode, status: row.status },
    phone: row.contactEnc ? unseal<{ phone: string }>(row.contactEnc, row.bookedBy).phone : null,
    checkin: row.sharedCheckinId ? await getCheckin(row.bookedBy, row.sharedCheckinId) : null,
  };
}
