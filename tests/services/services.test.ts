import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb, schema } from "@/lib/db";
import { pseudonymize } from "@/lib/privacy/server";
import { suppress, weeklyTierCounts } from "@/lib/services/aggregates";
import { bookSlot, cancelBooking, createSlots, getBookingForStaff, listOpenSlots, listStudentBookings } from "@/lib/services/booking";
import { createCheckin, getCheckin, listCheckins, setKeep } from "@/lib/services/checkins";
import { createContactRequest, getContactRequestForStaff, listContactRequests } from "@/lib/services/contactRequests";
import { runRetention } from "@/lib/services/retention";
import { eraseStudent, exportStudentData, recordConsent } from "@/lib/services/studentData";
import type { CheckinAnswers } from "@/lib/safety/triage";

const nulls = (n: number) => Array.from({ length: n }, () => null);
const campus = { sleep: 2, academics: 1, safety: "no" } as const;
let counter = 0;

async function newStudent() {
  const p = pseudonymize(`student${++counter}-${Date.now()}@nitp.ac.in`);
  await recordConsent(p);
  return p;
}

const mildAnswers: CheckinAnswers = { phq9: [0, 1, ...nulls(6), 0], gad7: [1, 0, ...nulls(5)] };

describe("check-ins", () => {
  it("re-scores on the server and ignores anything the client claims", async () => {
    const p = await newStudent();
    const crisisInput: CheckinAnswers = {
      ...mildAnswers,
      phq9: [0, 0, ...nulls(6), 3],
      cssrs: { wishToBeDead: true, activeThoughts: true, method: true, intent: true, planWithIntent: false, behavior: "never" },
    };
    const saved = await createCheckin(p, { answers: crisisInput, campus, locale: "en" });
    expect(saved.triage.tier).toBe("crisis");
  });

  it("stores answers encrypted and never stores free text", async () => {
    const p = await newStudent();
    const secret = "my roommate Arjun and I fight every night";
    const { id } = await createCheckin(p, { answers: { ...mildAnswers, freeText: [secret] }, campus, locale: "en" });

    const db = await getDb();
    const [row] = await db.select().from(schema.checkins).where(eq(schema.checkins.id, id));
    expect(row.payloadEnc.startsWith("v1.")).toBe(true);
    expect(JSON.stringify(row)).not.toContain("Arjun");

    const record = await getCheckin(p, id);
    expect(JSON.stringify(record)).not.toContain("Arjun");
    expect(record?.answers.phq9).toEqual(mildAnswers.phq9);
    expect(record?.triage).not.toHaveProperty("textDetection");
  });

  it("is invisible to other students", async () => {
    const owner = await newStudent();
    const other = await newStudent();
    const { id } = await createCheckin(owner, { answers: mildAnswers, campus, locale: "en" });
    expect(await getCheckin(other, id)).toBeNull();
    expect(await setKeep(other, id, true)).toBe(false);
  });

  it("lists newest first", async () => {
    const p = await newStudent();
    const a = await createCheckin(p, { answers: mildAnswers, campus, locale: "en" });
    const b = await createCheckin(p, { answers: mildAnswers, campus, locale: "hi" });
    const db = await getDb();
    await db.update(schema.checkins).set({ createdAt: new Date(Date.now() - 60_000) }).where(eq(schema.checkins.id, a.id));
    expect((await listCheckins(p)).map((c) => c.id)).toEqual([b.id, a.id]);
  });
});

describe("contact requests", () => {
  it("shares the latest check-in and encrypted contact details, and audits staff access", async () => {
    const p = await newStudent();
    await createCheckin(p, { answers: { ...mildAnswers, phq9: [0, 0, ...nulls(6), 1] }, campus, locale: "en" });
    const created = await createContactRequest(p, { phone: "9876543210", name: "R" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const db = await getDb();
    const [row] = await db.select().from(schema.contactRequests).where(eq(schema.contactRequests.id, created.id));
    expect(row.contactEnc).not.toContain("9876543210");

    const queue = await listContactRequests(["new"]);
    expect(queue.find((q) => q.id === created.id)?.tier).toBe("urgent");

    const detail = await getContactRequestForStaff(created.id, "counsellor@nitp.ac.in");
    expect(detail?.contact.phone).toBe("9876543210");
    expect(detail?.checkin?.triage.tier).toBe("urgent");

    const audits = await db.select().from(schema.auditLog).where(eq(schema.auditLog.targetId, created.id));
    expect(audits.map((a) => a.action)).toContain("view_contact_request");
  });

  it("requires a check-in and caps open requests", async () => {
    const p = await newStudent();
    expect(await createContactRequest(p, { phone: "9876543210" })).toEqual({ ok: false, error: "no_checkin" });
    await createCheckin(p, { answers: mildAnswers, campus, locale: "en" });
    for (let i = 0; i < 3; i++) expect((await createContactRequest(p, { phone: "9876543210" })).ok).toBe(true);
    expect(await createContactRequest(p, { phone: "9876543210" })).toEqual({ ok: false, error: "too_many" });
  });
});

describe("booking", () => {
  const tomorrow = () => new Date(Date.now() + 86_400_000);

  it("lets exactly one of two students book a slot", async () => {
    await createSlots("counsellor@nitp.ac.in", { firstStart: tomorrow(), durationMinutes: 45, perDay: 1, weeks: 1, location: "Room A", mode: "in_person" });
    const slot = (await listOpenSlots()).find((s) => s.location === "Room A")!;
    const [a, b] = [await newStudent(), await newStudent()];
    const results = await Promise.all([
      bookSlot(a, slot.id, { shareLatestCheckin: false }),
      bookSlot(b, slot.id, { shareLatestCheckin: false }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: "taken" }]);
  });

  it("shares a check-in only when asked, and cancel returns the slot", async () => {
    await createSlots("counsellor@nitp.ac.in", { firstStart: tomorrow(), durationMinutes: 30, perDay: 2, weeks: 1, location: "Room B", mode: "phone" });
    const [s1, s2] = (await listOpenSlots()).filter((s) => s.location === "Room B");
    const p = await newStudent();
    await createCheckin(p, { answers: mildAnswers, campus, locale: "en" });

    expect(await bookSlot(p, s1.id, { shareLatestCheckin: false })).toEqual({ ok: true });
    expect((await getBookingForStaff(s1.id, "counsellor@nitp.ac.in"))?.checkin).toBeNull();

    expect(await bookSlot(p, s2.id, { shareLatestCheckin: true, phone: "9123456789" })).toEqual({ ok: true });
    const shared = await getBookingForStaff(s2.id, "counsellor@nitp.ac.in");
    expect(shared?.checkin?.triage.tier).toBe("mild");
    expect(shared?.phone).toBe("9123456789");

    expect(await cancelBooking(p, s1.id)).toBe(true);
    expect((await listOpenSlots()).some((s) => s.id === s1.id)).toBe(true);
  });

  it("limits upcoming bookings per student", async () => {
    await createSlots("counsellor@nitp.ac.in", { firstStart: tomorrow(), durationMinutes: 30, perDay: 3, weeks: 1, location: "Room C", mode: "video" });
    const slots = (await listOpenSlots()).filter((s) => s.location === "Room C");
    const p = await newStudent();
    expect((await bookSlot(p, slots[0].id, { shareLatestCheckin: false })).ok).toBe(true);
    expect((await bookSlot(p, slots[1].id, { shareLatestCheckin: false })).ok).toBe(true);
    expect(await bookSlot(p, slots[2].id, { shareLatestCheckin: false })).toEqual({ ok: false, error: "too_many" });
  });
});

describe("export and erasure", () => {
  it("exports decrypted data, then erases everything and frees future bookings", async () => {
    const p = await newStudent();
    await createCheckin(p, { answers: mildAnswers, campus, locale: "en" });
    await createContactRequest(p, { email: "me@example.com" });
    await createSlots("counsellor@nitp.ac.in", { firstStart: new Date(Date.now() + 2 * 86_400_000), durationMinutes: 30, perDay: 1, weeks: 1, location: "Room E", mode: "in_person" });
    const slot = (await listOpenSlots()).find((s) => s.location === "Room E")!;
    await bookSlot(p, slot.id, { shareLatestCheckin: true });

    const exported = await exportStudentData(p);
    expect(exported.checkins).toHaveLength(1);
    expect(exported.contactRequests[0].contact.email).toBe("me@example.com");
    expect(exported.bookings).toHaveLength(1);

    await eraseStudent(p);
    const db = await getDb();
    const remaining = await db.execute(
      sql`select (select count(*) from students where pseudonym = ${p})::int as s,
                 (select count(*) from checkins where pseudonym = ${p})::int as c,
                 (select count(*) from contact_requests where pseudonym = ${p})::int as r,
                 (select count(*) from slots where booked_by = ${p})::int as b`,
    );
    expect(remaining.rows[0]).toEqual({ s: 0, c: 0, r: 0, b: 0 });
    expect(await listStudentBookings(p)).toEqual([]);
    expect((await listOpenSlots()).some((s) => s.id === slot.id)).toBe(true);
  });
});

describe("retention", () => {
  it("deletes old check-ins unless kept", async () => {
    const p = await newStudent();
    const old = await createCheckin(p, { answers: mildAnswers, campus, locale: "en" });
    const kept = await createCheckin(p, { answers: mildAnswers, campus, locale: "en" });
    const fresh = await createCheckin(p, { answers: mildAnswers, campus, locale: "en" });
    const db = await getDb();
    const longAgo = new Date(Date.now() - 400 * 86_400_000);
    await db.update(schema.checkins).set({ createdAt: longAgo }).where(eq(schema.checkins.id, old.id));
    await db.update(schema.checkins).set({ createdAt: longAgo, keep: true }).where(eq(schema.checkins.id, kept.id));

    const result = await runRetention(12);
    expect(result.checkins).toBeGreaterThanOrEqual(1);
    expect((await listCheckins(p)).map((c) => c.id).sort()).toEqual([kept.id, fresh.id].sort());
  });
});

describe("k-anonymous aggregates", () => {
  it("hides small counts and one complementary cell", () => {
    expect(suppress([50, 3, 20, 0, 0])).toEqual([50, "suppressed", "suppressed", 0, 0]);
    expect(suppress([50, 3, 4, 0, 0])).toEqual([50, "suppressed", "suppressed", 0, 0]);
    expect(suppress([50, 30, 20, 10, 0])).toEqual([50, 30, 20, 10, 0]);
  });

  it("never reports a week with fewer than 10 students as a number", async () => {
    const weeks = await weeklyTierCounts(12);
    for (const w of weeks) {
      if (typeof w.students === "number") expect(w.students).toBeGreaterThanOrEqual(10);
      for (const cell of Object.values(w.byTier)) if (typeof cell === "number" && cell > 0) expect(cell).toBeGreaterThanOrEqual(10);
    }
  });
});
