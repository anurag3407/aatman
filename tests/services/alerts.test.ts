import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, schema } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { pseudonymize } from "@/lib/privacy/server";
import type { CheckinAnswers } from "@/lib/safety/triage";
import {
  acknowledgeAlert,
  createOnCallShift,
  getAlertForStaff,
  getAlertRecipients,
  listOpenAlerts,
  processOutbox,
  resolveAlert,
  runAlertEscalation,
} from "@/lib/services/alerts";
import { createCheckin } from "@/lib/services/checkins";
import { createContactRequest } from "@/lib/services/contactRequests";
import { recordConsent } from "@/lib/services/studentData";

const originalAlertEmails = process.env.ALERT_EMAILS;
const STAFF = "counsellor@nitp.ac.in";

const nulls = (n: number) => Array.from({ length: n }, () => null);
const campus = { sleep: 2, academics: 1, safety: "no" } as const;
let counter = 0;

async function newStudent() {
  const p = pseudonymize(`alert-student${++counter}-${Date.now()}@nitp.ac.in`);
  await recordConsent(p);
  return p;
}

const mildAnswers: CheckinAnswers = { phq9: [0, 1, ...nulls(6), 0], gad7: [1, 0, ...nulls(5)] };
const crisisAnswers: CheckinAnswers = {
  ...mildAnswers,
  phq9: [0, 0, ...nulls(6), 3],
  cssrs: { wishToBeDead: true, activeThoughts: true, method: true, intent: true, planWithIntent: false, behavior: "never" },
};
const urgentAnswers: CheckinAnswers = {
  ...mildAnswers,
  phq9: [0, 0, ...nulls(6), 1],
  cssrs: { wishToBeDead: true, activeThoughts: true, method: false, intent: false, planWithIntent: false, behavior: "never" },
};

async function alertFor(checkinId: string) {
  const db = await getDb();
  const [row] = await db.select().from(schema.crisisAlerts).where(eq(schema.crisisAlerts.checkinId, checkinId));
  return row;
}

describe("crisis alerts", () => {
  beforeAll(() => {
    process.env.ALERT_EMAILS = "oncall@nitp.ac.in,lead@nitp.ac.in";
    resetEnvCache();
  });

  afterAll(() => {
    if (originalAlertEmails === undefined) delete process.env.ALERT_EMAILS;
    else process.env.ALERT_EMAILS = originalAlertEmails;
    resetEnvCache();
  });

  it("creates an alert for a crisis check-in, with a PII-free notification", async () => {
    const p = await newStudent();
    const { id } = await createCheckin(p, { answers: crisisAnswers, campus, locale: "en" });
    const alert = await alertFor(id);
    expect(alert?.tier).toBe("crisis");
    expect(alert?.status).toBe("open");

    const db = await getDb();
    const outbox = await db.select().from(schema.notificationOutbox);
    const mine = outbox.filter((row) => row.body.includes(alert!.id));
    expect(mine.length).toBeGreaterThan(0);
    expect(mine[0].toEmail).toMatch(/@nitp\.ac\.in$/);
    expect(mine[0].body).not.toContain(p);
    expect(mine[0].body.toLowerCase()).not.toContain("phq");
    expect(mine[0].body.toLowerCase()).not.toContain("phone");
  });

  it("creates an alert for an urgent check-in", async () => {
    const p = await newStudent();
    const saved = await createCheckin(p, { answers: urgentAnswers, campus, locale: "en" });
    expect(saved.triage.tier).toBe("urgent");
    expect((await alertFor(saved.id))?.tier).toBe("urgent");
  });

  it("does not alert on mild check-ins", async () => {
    const p = await newStudent();
    const { id } = await createCheckin(p, { answers: mildAnswers, campus, locale: "en" });
    expect(await alertFor(id)).toBeUndefined();
  });

  it("acknowledges once, then resolves with an encrypted note", async () => {
    const p = await newStudent();
    const { id } = await createCheckin(p, { answers: crisisAnswers, campus, locale: "en" });
    const alert = await alertFor(id);

    expect(await acknowledgeAlert(alert!.id, STAFF)).toBe(true);
    expect(await acknowledgeAlert(alert!.id, STAFF)).toBe(false);

    const detail = await getAlertForStaff(alert!.id, STAFF);
    expect(detail?.status).toBe("acknowledged");
    expect(detail?.acknowledgedBy).toBe(STAFF);

    expect(await resolveAlert(alert!.id, STAFF, "Called; safety plan agreed")).toBe(true);
    const db = await getDb();
    const [row] = await db.select().from(schema.crisisAlerts).where(eq(schema.crisisAlerts.id, alert!.id));
    expect(row.status).toBe("resolved");
    expect(row.noteEnc).not.toContain("safety plan");

    const resolved = await getAlertForStaff(alert!.id, STAFF);
    expect(resolved?.note).toBe("Called; safety plan agreed");
  });

  it("links a later contact request to the open alert", async () => {
    const p = await newStudent();
    const { id } = await createCheckin(p, { answers: crisisAnswers, campus, locale: "en" });
    const alert = await alertFor(id);
    const created = await createContactRequest(p, { phone: "9876543210" });
    expect(created.ok).toBe(true);

    const db = await getDb();
    const [row] = await db.select().from(schema.crisisAlerts).where(eq(schema.crisisAlerts.id, alert!.id));
    expect(row.contactRequestId).toBe(created.ok ? created.id : null);
  });

  it("escalates an unacknowledged crisis alert and stops after acknowledgement", async () => {
    const p = await newStudent();
    const { id } = await createCheckin(p, { answers: crisisAnswers, campus, locale: "en" });
    const alert = await alertFor(id);
    const db = await getDb();
    const created = new Date(Date.now() - 11 * 60_000);
    await db.update(schema.crisisAlerts).set({ createdAt: created }).where(eq(schema.crisisAlerts.id, alert!.id));

    expect(await runAlertEscalation(new Date())).toBeGreaterThanOrEqual(1);
    const [escalated] = await db.select().from(schema.crisisAlerts).where(eq(schema.crisisAlerts.id, alert!.id));
    expect(escalated.escalationLevel).toBe(1);
    expect(escalated.escalatedAt).not.toBeNull();

    await acknowledgeAlert(alert!.id, STAFF);
    const before = (await db.select().from(schema.notificationOutbox)).length;
    await runAlertEscalation(new Date());
    expect((await db.select().from(schema.notificationOutbox)).length).toBe(before);
  });

  it("delivers with retries and marks permanent failures dead", async () => {
    const db = await getDb();
    // Deliver everything pending first.
    const delivered = await processOutbox(new Date(), async () => ({ ok: true }));
    expect(delivered.claimed).toBeGreaterThan(0);
    expect(delivered.sent).toBe(delivered.claimed);

    const subject = `failure-${Date.now()}`;
    const [row] = await db
      .insert(schema.notificationOutbox)
      .values({
        kind: "crisis_alert",
        toEmail: "fail@nitp.ac.in",
        subject,
        body: "test",
        nextAttemptAt: new Date(0),
      })
      .returning();

    for (let i = 0; i < 5; i++) {
      await processOutbox(new Date(Date.now() + i * 2 * 60 * 60_000), async () => ({ ok: false, error: "smtp_down" }));
    }
    const [failed] = await db.select().from(schema.notificationOutbox).where(eq(schema.notificationOutbox.id, row.id));
    expect(failed.attempts).toBe(5);
    expect(failed.status).toBe("dead");
    expect(failed.lastError).toBe("smtp_down");
  });

  it("routes new alerts to the active on-call shift before the fallback list", async () => {
    const now = new Date();
    const staff = `oncall-${Date.now()}@nitp.ac.in`;
    await createOnCallShift(
      {
        staffEmail: staff,
        role: "counsellor",
        startsAt: new Date(now.getTime() - 60 * 60_000),
        endsAt: new Date(now.getTime() + 60 * 60_000),
        backupEmail: "backup@nitp.ac.in",
      },
      STAFF,
    );
    expect(await getAlertRecipients(now)).toEqual([staff]);
  });

  it("lists only open and acknowledged alerts, crisis first", async () => {
    const open = await listOpenAlerts();
    expect(open.every((a) => a.status === "open" || a.status === "acknowledged")).toBe(true);
    const firstUrgent = open.findIndex((a) => a.tier === "urgent");
    const lastCrisis = open.map((a) => a.tier).lastIndexOf("crisis");
    if (firstUrgent !== -1 && lastCrisis !== -1) expect(lastCrisis).toBeLessThan(firstUrgent);
  });

  it("does not expose the pseudonym through the staff view", async () => {
    const p = await newStudent();
    const { id } = await createCheckin(p, { answers: crisisAnswers, campus, locale: "en" });
    const alert = await alertFor(id);
    const detail = await getAlertForStaff(alert!.id, STAFF);
    expect(JSON.stringify(detail)).not.toContain(p);
  });

  it("deletes resolved alerts and their notifications on retention", async () => {
    const p = await newStudent();
    const { id } = await createCheckin(p, { answers: crisisAnswers, campus, locale: "en" });
    const alert = await alertFor(id);
    await resolveAlert(alert!.id, STAFF, "closed");
    const db = await getDb();
    await db
      .update(schema.crisisAlerts)
      .set({ resolvedAt: new Date(Date.now() - 400 * 86_400_000) })
      .where(and(eq(schema.crisisAlerts.id, alert!.id)));
    const { runRetention } = await import("@/lib/services/retention");
    const result = await runRetention(12);
    expect(result.alerts).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(schema.crisisAlerts).where(eq(schema.crisisAlerts.id, alert!.id));
    expect(row).toBeUndefined();
  });
});
