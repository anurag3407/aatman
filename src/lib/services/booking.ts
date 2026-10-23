import "server-only";
import { and, asc, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { seal, unseal } from "@/lib/privacy/server";
import { tierRank, type Tier } from "@/lib/safety/triage";
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
  isUrgent: boolean;
  counsellorName: string | null;
  counsellorLanguages: string | null;
}

const slotFields = {
  id: schema.slots.id,
  startsAt: schema.slots.startsAt,
  endsAt: schema.slots.endsAt,
  location: schema.slots.location,
  mode: schema.slots.mode,
  isUrgent: schema.slots.isUrgent,
};

const counsellorFields = {
  counsellorName: schema.counsellors.displayName,
  counsellorLanguages: schema.counsellors.languages,
};

function withCounsellor<T extends { counsellorName: string | null; counsellorLanguages: string | null }>(row: T) {
  return { ...row, counsellorName: row.counsellorName ?? null, counsellorLanguages: row.counsellorLanguages ?? null };
}

/** Urgent-tier students may see the reserved slots. Everyone else gets the normal pool. */
async function mayUseUrgent(pseudonym: string): Promise<boolean> {
  const latest = await latestCheckin(pseudonym);
  return latest ? tierRank(latest.triage.tier as Tier) >= tierRank("elevated") : false;
}

export async function listOpenSlots(
  now = new Date(),
  opts: { includeUrgent?: boolean } = {},
): Promise<PublicSlot[]> {
  const db = await getDb();
  const until = new Date(now.getTime() + BOOKING_WINDOW_DAYS * 86_400_000);
  const rows = await db
    .select({ ...slotFields, ...counsellorFields })
    .from(schema.slots)
    .leftJoin(schema.counsellors, eq(schema.slots.counsellorEmail, schema.counsellors.email))
    .where(
      and(
        eq(schema.slots.status, "open"),
        gt(schema.slots.startsAt, now),
        lt(schema.slots.startsAt, until),
        opts.includeUrgent ? undefined : eq(schema.slots.isUrgent, false),
      ),
    )
    .orderBy(asc(schema.slots.startsAt));
  return rows.map(withCounsellor);
}

export async function listStudentBookings(pseudonym: string, now = new Date()) {
  const db = await getDb();
  const rows = await db
    .select({
      ...slotFields,
      ...counsellorFields,
      status: schema.slots.status,
      reminderOptIn: schema.slots.reminderOptIn,
      attendedAt: schema.slots.attendedAt,
      noShowAt: schema.slots.noShowAt,
    })
    .from(schema.slots)
    .leftJoin(schema.counsellors, eq(schema.slots.counsellorEmail, schema.counsellors.email))
    .where(and(eq(schema.slots.bookedBy, pseudonym), gt(schema.slots.endsAt, now)))
    .orderBy(asc(schema.slots.startsAt));
  return rows.map(withCounsellor);
}

export type BookResult = { ok: true } | { ok: false; error: "taken" | "too_many" | "no_checkin" | "not_eligible" };

export async function bookSlot(
  pseudonym: string,
  slotId: string,
  opts: { shareLatestCheckin: boolean; phone?: string; reminderOptIn?: boolean },
  now = new Date(),
): Promise<BookResult> {
  const db = await getDb();

  const [target] = await db.select().from(schema.slots).where(eq(schema.slots.id, slotId));
  if (!target || target.status !== "open" || target.startsAt <= now) return { ok: false, error: "taken" };
  if (target.isUrgent && !(await mayUseUrgent(pseudonym))) return { ok: false, error: "not_eligible" };

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
      reminderOptIn: Boolean(opts.phone && opts.reminderOptIn),
    })
    .where(and(eq(schema.slots.id, slotId), eq(schema.slots.status, "open"), gt(schema.slots.startsAt, now)))
    .returning({ id: schema.slots.id });
  return won.length ? { ok: true } : { ok: false, error: "taken" };
}

function clearedBooking() {
  return {
    status: "open" as const,
    bookedBy: null,
    bookedAt: null,
    sharedCheckinId: null,
    contactEnc: null,
    reminderOptIn: false,
    reminder24AttemptAt: null,
    reminder24SentAt: null,
    reminder2AttemptAt: null,
    reminder2SentAt: null,
    attendedAt: null,
    noShowAt: null,
    markedBy: null,
  };
}

export async function cancelBooking(pseudonym: string, slotId: string, now = new Date()): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .update(schema.slots)
    .set(clearedBooking())
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

export type RescheduleResult = { ok: true } | { ok: false; error: "not_found" | "taken" | "not_eligible" };

/** Moves a booking atomically. The old slot is released only if the new one is secured. */
export async function rescheduleBooking(
  pseudonym: string,
  fromSlotId: string,
  toSlotId: string,
  now = new Date(),
): Promise<RescheduleResult> {
  if (fromSlotId === toSlotId) return { ok: false, error: "not_found" };
  const [target] = await (await getDb()).select().from(schema.slots).where(eq(schema.slots.id, toSlotId));
  if (target?.isUrgent && !(await mayUseUrgent(pseudonym))) return { ok: false, error: "not_eligible" };

  const db = await getDb();
  const result = await db.transaction(async (tx) => {
    const [from] = await tx
      .select()
      .from(schema.slots)
      .where(
        and(
          eq(schema.slots.id, fromSlotId),
          eq(schema.slots.bookedBy, pseudonym),
          eq(schema.slots.status, "booked"),
          gt(schema.slots.startsAt, now),
        ),
      )
      .for("update");
    if (!from) return { ok: false as const, error: "not_found" as const };

    const [to] = await tx
      .select()
      .from(schema.slots)
      .where(and(eq(schema.slots.id, toSlotId), eq(schema.slots.status, "open"), gt(schema.slots.startsAt, now)))
      .for("update");
    if (!to) return { ok: false as const, error: "taken" as const };

    await tx.update(schema.slots).set(clearedBooking()).where(eq(schema.slots.id, from.id));
    await tx
      .update(schema.slots)
      .set({
        status: "booked",
        bookedBy: pseudonym,
        bookedAt: now,
        sharedCheckinId: from.sharedCheckinId,
        contactEnc: from.contactEnc,
        reminderOptIn: from.reminderOptIn,
        reminder24AttemptAt: null,
        reminder24SentAt: null,
        reminder2AttemptAt: null,
        reminder2SentAt: null,
      })
      .where(and(eq(schema.slots.id, to.id), eq(schema.slots.status, "open")));
    return { ok: true as const };
  });

  if (result.ok) await recordAudit("student", "reschedule_booking", "slot", toSlotId);
  return result;
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
  isUrgent?: boolean;
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
        isUrgent: spec.isUrgent ?? false,
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
  return db
    .select({
      ...slotFields,
      status: schema.slots.status,
      counsellorEmail: schema.slots.counsellorEmail,
      booked: sql<boolean>`${schema.slots.bookedBy} is not null`,
      shared: sql<boolean>`${schema.slots.sharedCheckinId} is not null`,
      reminderOptIn: schema.slots.reminderOptIn,
      attendedAt: schema.slots.attendedAt,
      noShowAt: schema.slots.noShowAt,
    })
    .from(schema.slots)
    .where(and(gte(schema.slots.endsAt, now), inArray(schema.slots.status, ["open", "booked"])))
    .orderBy(asc(schema.slots.startsAt));
}

/** Counsellor cancels a slot. A booked student sees it as cancelled in their list. */
export async function cancelSlotAsStaff(slotId: string, actor: string): Promise<void> {
  const db = await getDb();
  await db.update(schema.slots).set({ status: "cancelled" }).where(eq(schema.slots.id, slotId));
  await recordAudit(actor, "cancel_slot", "slot", slotId);
}

export async function markAttendance(
  slotId: string,
  actor: string,
  attended: boolean,
  now = new Date(),
): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .update(schema.slots)
    .set({
      attendedAt: attended ? now : null,
      noShowAt: attended ? null : now,
      markedBy: actor,
    })
    .where(and(eq(schema.slots.id, slotId), eq(schema.slots.status, "booked"), lt(schema.slots.startsAt, now)))
    .returning({ id: schema.slots.id });
  if (!rows.length) return false;
  await recordAudit(actor, "mark_attendance", "slot", slotId);
  return true;
}

export interface BookingDetail {
  slot: PublicSlot & { status: SlotRow["status"]; attendedAt: Date | null; noShowAt: Date | null };
  phone: string | null;
  checkin: CheckinRecord | null;
}

export async function getBookingForStaff(slotId: string, actor: string): Promise<BookingDetail | null> {
  const db = await getDb();
  const [row] = await db
    .select({ ...slotFields, status: schema.slots.status, attendedAt: schema.slots.attendedAt, noShowAt: schema.slots.noShowAt, ...counsellorFields, bookedBy: schema.slots.bookedBy, contactEnc: schema.slots.contactEnc, sharedCheckinId: schema.slots.sharedCheckinId })
    .from(schema.slots)
    .leftJoin(schema.counsellors, eq(schema.slots.counsellorEmail, schema.counsellors.email))
    .where(eq(schema.slots.id, slotId));
  if (!row || !row.bookedBy) return null;
  await recordAudit(actor, "view_booking", "slot", slotId);
  return {
    slot: {
      id: row.id,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      location: row.location,
      mode: row.mode,
      isUrgent: row.isUrgent,
      counsellorName: row.counsellorName ?? null,
      counsellorLanguages: row.counsellorLanguages ?? null,
      status: row.status,
      attendedAt: row.attendedAt,
      noShowAt: row.noShowAt,
    },
    phone: row.contactEnc ? unseal<{ phone: string }>(row.contactEnc, row.bookedBy).phone : null,
    checkin: row.sharedCheckinId ? await getCheckin(row.bookedBy, row.sharedCheckinId) : null,
  };
}
