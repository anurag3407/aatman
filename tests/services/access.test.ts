import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb, schema } from "@/lib/db";
import { pseudonymize } from "@/lib/privacy/server";
import type { CheckinAnswers } from "@/lib/safety/triage";
import { bookSlot, createSlots, listOpenSlots, markAttendance, rescheduleBooking } from "@/lib/services/booking";
import { createCheckin } from "@/lib/services/checkins";
import { upsertCounsellor } from "@/lib/services/counsellors";
import { runAppointmentReminders } from "@/lib/services/reminders";
import { recordConsent } from "@/lib/services/studentData";

const nulls = (n: number) => Array.from({ length: n }, () => null);
const campus = { sleep: 2, academics: 1, safety: "no" } as const;
const COUNSELLOR = "counsellor@nitp.ac.in";
let counter = 0;

async function newStudent() {
  const p = pseudonymize(`access-student${++counter}-${Date.now()}@nitp.ac.in`);
  await recordConsent(p);
  return p;
}

const mildAnswers: CheckinAnswers = { phq9: [0, 1, ...nulls(6), 0], gad7: [1, 0, ...nulls(5)] };
const crisisAnswers: CheckinAnswers = {
  ...mildAnswers,
  phq9: [0, 0, ...nulls(6), 3],
  cssrs: { wishToBeDead: true, activeThoughts: true, method: true, intent: true, planWithIntent: false, behavior: "never" },
};

const at = (hours: number) => new Date(Date.now() + hours * 3_600_000);

describe("counsellor profiles and slot visibility", () => {
  it("shows the counsellor name and languages with a slot", async () => {
    await upsertCounsellor({ email: COUNSELLOR, displayName: "Dr Rao", languages: "Hindi, English" }, COUNSELLOR);
    await createSlots(COUNSELLOR, {
      firstStart: at(30),
      durationMinutes: 45,
      perDay: 1,
      weeks: 1,
      location: "Profile Room",
      mode: "in_person",
    });
    const slot = (await listOpenSlots()).find((s) => s.location === "Profile Room");
    expect(slot?.counsellorName).toBe("Dr Rao");
    expect(slot?.counsellorLanguages).toBe("Hindi, English");
  });

  it("hides priority slots unless the student is eligible", async () => {
    await createSlots(COUNSELLOR, {
      firstStart: at(40),
      durationMinutes: 30,
      perDay: 1,
      weeks: 1,
      location: "Urgent Room",
      mode: "phone",
      isUrgent: true,
    });
    expect((await listOpenSlots()).some((s) => s.location === "Urgent Room")).toBe(false);
    expect((await listOpenSlots(undefined, { includeUrgent: true })).some((s) => s.location === "Urgent Room")).toBe(true);
  });

  it("enforces priority eligibility at booking time, not just in the UI", async () => {
    await createSlots(COUNSELLOR, {
      firstStart: at(50),
      durationMinutes: 30,
      perDay: 1,
      weeks: 1,
      location: "Eligibility Room",
      mode: "phone",
      isUrgent: true,
    });
    const slot = (await listOpenSlots(undefined, { includeUrgent: true })).find((s) => s.location === "Eligibility Room")!;

    const mild = await newStudent();
    await createCheckin(mild, { answers: mildAnswers, campus, locale: "en" });
    expect(await bookSlot(mild, slot.id, { shareLatestCheckin: false })).toEqual({ ok: false, error: "not_eligible" });

    const crisis = await newStudent();
    await createCheckin(crisis, { answers: crisisAnswers, campus, locale: "en" });
    expect(await bookSlot(crisis, slot.id, { shareLatestCheckin: false })).toEqual({ ok: true });
  });
});

describe("rescheduling", () => {
  it("moves a booking atomically and leaves the old slot bookable", async () => {
    await createSlots(COUNSELLOR, {
      firstStart: at(60),
      durationMinutes: 30,
      perDay: 1,
      weeks: 1,
      location: "Reschedule A",
      mode: "in_person",
    });
    await createSlots(COUNSELLOR, {
      firstStart: at(70),
      durationMinutes: 30,
      perDay: 1,
      weeks: 1,
      location: "Reschedule B",
      mode: "in_person",
    });
    const [a, b] = [
      (await listOpenSlots()).find((s) => s.location === "Reschedule A")!,
      (await listOpenSlots()).find((s) => s.location === "Reschedule B")!,
    ];
    const p = await newStudent();
    expect((await bookSlot(p, a.id, { shareLatestCheckin: false })).ok).toBe(true);

    expect(await rescheduleBooking(p, a.id, b.id)).toEqual({ ok: true });
    const openAfter = await listOpenSlots();
    expect(openAfter.some((s) => s.id === a.id)).toBe(true);
    expect(openAfter.some((s) => s.id === b.id)).toBe(false);
  });

  it("keeps the original booking when the target is taken", async () => {
    await createSlots(COUNSELLOR, {
      firstStart: at(80),
      durationMinutes: 30,
      perDay: 1,
      weeks: 1,
      location: "Reschedule C",
      mode: "in_person",
    });
    await createSlots(COUNSELLOR, {
      firstStart: at(90),
      durationMinutes: 30,
      perDay: 1,
      weeks: 1,
      location: "Reschedule D",
      mode: "in_person",
    });
    const [c, d] = [
      (await listOpenSlots()).find((s) => s.location === "Reschedule C")!,
      (await listOpenSlots()).find((s) => s.location === "Reschedule D")!,
    ];
    const p = await newStudent();
    const other = await newStudent();
    await bookSlot(p, c.id, { shareLatestCheckin: false });
    await bookSlot(other, d.id, { shareLatestCheckin: false });

    expect(await rescheduleBooking(p, c.id, d.id)).toEqual({ ok: false, error: "taken" });
    const db = await getDb();
    const [row] = await db.select().from(schema.slots).where(eq(schema.slots.id, c.id));
    expect(row.status).toBe("booked");
    expect(row.bookedBy).toBe(p);
  });
});

describe("attendance", () => {
  it("only marks a session after it starts, and records attended or no-show", async () => {
    await createSlots(COUNSELLOR, {
      firstStart: at(1),
      durationMinutes: 30,
      perDay: 1,
      weeks: 1,
      location: "Attendance Room",
      mode: "in_person",
    });
    const slot = (await listOpenSlots()).find((s) => s.location === "Attendance Room")!;
    const p = await newStudent();
    await bookSlot(p, slot.id, { shareLatestCheckin: false });

    expect(await markAttendance(slot.id, COUNSELLOR, true)).toBe(false);

    const db = await getDb();
    const past = new Date(Date.now() - 60 * 60_000);
    await db.update(schema.slots).set({ startsAt: past, endsAt: new Date(past.getTime() + 30 * 60_000) }).where(eq(schema.slots.id, slot.id));
    expect(await markAttendance(slot.id, COUNSELLOR, true)).toBe(true);

    const [row] = await db.select().from(schema.slots).where(eq(schema.slots.id, slot.id));
    expect(row.attendedAt).not.toBeNull();
    expect(row.noShowAt).toBeNull();
    expect(row.markedBy).toBe(COUNSELLOR);
  });
});

describe("SMS reminders", () => {
  it("sends one neutral reminder in the 24-hour window and does not repeat it", async () => {
    const now = new Date();
    await createSlots(COUNSELLOR, {
      firstStart: new Date(now.getTime() + 24 * 3_600_000),
      durationMinutes: 30,
      perDay: 1,
      weeks: 1,
      location: "Reminder Room",
      mode: "phone",
    });
    const slot = (await listOpenSlots(now)).find((s) => s.location === "Reminder Room")!;
    const p = await newStudent();
    expect((await bookSlot(p, slot.id, { shareLatestCheckin: false, phone: "9876543210", reminderOptIn: true }, now)).ok).toBe(true);

    const sent: { to: string; text: string }[] = [];
    const result = await runAppointmentReminders(now, async (message) => {
      sent.push(message);
      return { ok: true };
    });
    expect(result.sent).toBeGreaterThanOrEqual(1);
    const reminder = sent.find((m) => m.to === "9876543210");
    expect(reminder?.text).toContain("appointment");
    expect(reminder?.text.toLowerCase()).not.toContain("aatman");
    expect(reminder?.text.toLowerCase()).not.toContain("counsel");

    await runAppointmentReminders(now, async (message) => {
      sent.push(message);
      return { ok: true };
    });
    expect(sent.filter((m) => m.to === "9876543210")).toHaveLength(1);
  });

  it("sends a two-hour reminder as well", async () => {
    const now = new Date();
    await createSlots(COUNSELLOR, {
      firstStart: new Date(now.getTime() + 2 * 3_600_000),
      durationMinutes: 30,
      perDay: 1,
      weeks: 1,
      location: "Two Hour Room",
      mode: "phone",
    });
    const slot = (await listOpenSlots(now)).find((s) => s.location === "Two Hour Room")!;
    const p = await newStudent();
    await bookSlot(p, slot.id, { shareLatestCheckin: false, phone: "9123456789", reminderOptIn: true }, now);

    const sent: string[] = [];
    await runAppointmentReminders(now, async (message) => {
      sent.push(message.to);
      return { ok: true };
    });
    expect(sent).toContain("9123456789");
  });
});
