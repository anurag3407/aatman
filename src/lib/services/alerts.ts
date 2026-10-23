import "server-only";
import { and, asc, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { sendEmail, type DeliveryResult, type EmailMessage } from "@/lib/notify";
import { seal, unseal } from "@/lib/privacy/server";
import { recordAudit } from "./audit";

export type AlertTier = (typeof schema.ALERT_TIERS)[number];
export type AlertStatus = (typeof schema.ALERT_STATUS)[number];

/** Escalation thresholds in minutes, by tier. Level 1 → backup, 2 → clinical lead, 3 → admin. */
export const ESCALATION_MINUTES: Record<AlertTier, readonly [number, number, number]> = {
  crisis: [10, 20, 30],
  urgent: [30, 60, 120],
};

const MAX_DELIVERY_ATTEMPTS = 5;
const STALE_CLAIM_MS = 10 * 60_000;
const RETRY_MINUTES = [1, 5, 15, 60] as const;

function unique(emails: string[]): string[] {
  return [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

/** Who should be paged right now: the active on-call shift, or the configured fallback list. */
export async function getAlertRecipients(now = new Date()): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ email: schema.onCallShifts.staffEmail })
    .from(schema.onCallShifts)
    .where(and(lte(schema.onCallShifts.startsAt, now), gt(schema.onCallShifts.endsAt, now)))
    .orderBy(sql`case when ${schema.onCallShifts.role} = 'counsellor' then 0 else 1 end`);
  return unique(rows.length ? rows.map((r) => r.email) : env().ALERT_EMAILS);
}

/** PII-free message body. The alert id is opaque; the page behind it shows no student data. */
export function alertNotification(alertId: string, tier: AlertTier) {
  const base = env().APP_URL.replace(/\/$/, "");
  return {
    subject: `Aatman: ${tier} check-in needs acknowledgement`,
    body: [
      `A ${tier} check-in needs acknowledgement.`,
      "",
      `Open: ${base}/counsellor/alerts/${alertId}`,
      "",
      "This message contains no student details.",
    ].join("\n"),
  };
}

function escalationNotification(alertId: string, tier: AlertTier, level: number) {
  const base = env().APP_URL.replace(/\/$/, "");
  const who = level === 1 ? "backup counsellor" : level === 2 ? "clinical lead" : "administrator";
  return {
    subject: `Aatman: ${tier} alert still unacknowledged (${who})`,
    body: [
      `The ${tier} alert has not been acknowledged. Escalating to the ${who}.`,
      "",
      `Open: ${base}/counsellor/alerts/${alertId}`,
      "",
      "This message contains no student details.",
    ].join("\n"),
  };
}

export interface AlertSummary {
  id: string;
  createdAt: Date;
  tier: AlertTier;
  status: AlertStatus;
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
  escalatedAt: Date | null;
  escalationLevel: number;
  contactRequestId: string | null;
}

const summaryFields = {
  id: schema.crisisAlerts.id,
  createdAt: schema.crisisAlerts.createdAt,
  tier: schema.crisisAlerts.tier,
  status: schema.crisisAlerts.status,
  acknowledgedAt: schema.crisisAlerts.acknowledgedAt,
  acknowledgedBy: schema.crisisAlerts.acknowledgedBy,
  escalatedAt: schema.crisisAlerts.escalatedAt,
  escalationLevel: schema.crisisAlerts.escalationLevel,
  contactRequestId: schema.crisisAlerts.contactRequestId,
};

/** Most severe first, then oldest first so nothing sits unnoticed. */
export async function listOpenAlerts(): Promise<AlertSummary[]> {
  const db = await getDb();
  return db
    .select(summaryFields)
    .from(schema.crisisAlerts)
    .where(inArray(schema.crisisAlerts.status, ["open", "acknowledged"]))
    .orderBy(sql`case when ${schema.crisisAlerts.tier} = 'crisis' then 0 else 1 end`, asc(schema.crisisAlerts.createdAt));
}

export async function countOpenAlerts(): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.crisisAlerts)
    .where(inArray(schema.crisisAlerts.status, ["open", "acknowledged"]));
  return row?.n ?? 0;
}

export interface AlertDetail extends AlertSummary {
  note: string | null;
}

/** Opening an alert is audited. It still reveals no answers or contact details. */
export async function getAlertForStaff(id: string, actor: string): Promise<AlertDetail | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.crisisAlerts).where(eq(schema.crisisAlerts.id, id));
  if (!row) return null;
  await recordAudit(actor, "view_alert", "crisis_alert", id);
  return {
    id: row.id,
    createdAt: row.createdAt,
    tier: row.tier,
    status: row.status,
    acknowledgedAt: row.acknowledgedAt,
    acknowledgedBy: row.acknowledgedBy,
    escalatedAt: row.escalatedAt,
    escalationLevel: row.escalationLevel,
    contactRequestId: row.contactRequestId,
    note: row.noteEnc ? unseal<string>(row.noteEnc, row.pseudonym) : null,
  };
}

export async function acknowledgeAlert(id: string, actor: string, now = new Date()): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .update(schema.crisisAlerts)
    .set({ status: "acknowledged", acknowledgedAt: now, acknowledgedBy: actor })
    .where(and(eq(schema.crisisAlerts.id, id), eq(schema.crisisAlerts.status, "open")))
    .returning({ id: schema.crisisAlerts.id });
  if (!rows.length) return false;
  await recordAudit(actor, "acknowledge_alert", "crisis_alert", id);
  return true;
}

export async function resolveAlert(id: string, actor: string, note?: string, now = new Date()): Promise<boolean> {
  const db = await getDb();
  const [row] = await db.select().from(schema.crisisAlerts).where(eq(schema.crisisAlerts.id, id));
  if (!row) return false;
  const trimmed = note?.trim().slice(0, 2_000);
  const rows = await db
    .update(schema.crisisAlerts)
    .set({
      status: "resolved",
      resolvedAt: now,
      resolvedBy: actor,
      ...(trimmed ? { noteEnc: seal(trimmed, row.pseudonym) } : {}),
    })
    .where(and(eq(schema.crisisAlerts.id, id), inArray(schema.crisisAlerts.status, ["open", "acknowledged"])))
    .returning({ id: schema.crisisAlerts.id });
  if (!rows.length) return false;
  await recordAudit(actor, "resolve_alert", "crisis_alert", id);
  return true;
}

export interface NewOnCallShift {
  staffEmail: string;
  role: "counsellor" | "clinical_lead";
  startsAt: Date;
  endsAt: Date;
  backupEmail?: string;
}

export async function createOnCallShift(input: NewOnCallShift, actor: string): Promise<string> {
  if (!input.staffEmail.includes("@")) throw new Error("invalid staff email");
  if (input.endsAt <= input.startsAt) throw new Error("shift must end after it starts");
  if (input.endsAt.getTime() - input.startsAt.getTime() > 7 * 86_400_000) {
    throw new Error("shift cannot be longer than 7 days");
  }
  const db = await getDb();
  const [row] = await db
    .insert(schema.onCallShifts)
    .values({
      staffEmail: input.staffEmail.trim().toLowerCase(),
      role: input.role,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      backupEmail: input.backupEmail?.trim().toLowerCase() || null,
    })
    .returning({ id: schema.onCallShifts.id });
  await recordAudit(actor, "create_on_call", "on_call_shift", row.id);
  return row.id;
}

export async function listOnCallShifts(now = new Date()) {
  const db = await getDb();
  return db
    .select({
      id: schema.onCallShifts.id,
      staffEmail: schema.onCallShifts.staffEmail,
      role: schema.onCallShifts.role,
      startsAt: schema.onCallShifts.startsAt,
      endsAt: schema.onCallShifts.endsAt,
      backupEmail: schema.onCallShifts.backupEmail,
    })
    .from(schema.onCallShifts)
    .where(gt(schema.onCallShifts.endsAt, now))
    .orderBy(asc(schema.onCallShifts.startsAt));
}

/**
 * Raises the escalation level of unacknowledged alerts and queues one email per step.
 * Uses row locks so two instances cannot double-page the same person.
 */
export async function runAlertEscalation(now = new Date()): Promise<number> {
  const db = await getDb();
  const fallback = env().ALERT_EMAILS;
  const leads = env().CLINICAL_LEAD_EMAILS.length ? env().CLINICAL_LEAD_EMAILS : fallback;
  const admins = env().ADMIN_EMAILS.length ? env().ADMIN_EMAILS : fallback;
  const activeShifts = await db
    .select({ backupEmail: schema.onCallShifts.backupEmail })
    .from(schema.onCallShifts)
    .where(and(lte(schema.onCallShifts.startsAt, now), gt(schema.onCallShifts.endsAt, now)));
  const backups = activeShifts.map((s) => s.backupEmail).filter((e): e is string => Boolean(e));

  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(schema.crisisAlerts)
      .where(and(eq(schema.crisisAlerts.status, "open"), isNull(schema.crisisAlerts.acknowledgedAt)))
      .for("update", { skipLocked: true });

    let escalated = 0;
    for (const row of rows) {
      const thresholds = ESCALATION_MINUTES[row.tier];
      const ageMinutes = (now.getTime() - row.createdAt.getTime()) / 60_000;
      const desired = thresholds.filter((minutes) => ageMinutes >= minutes).length;
      if (desired <= row.escalationLevel) continue;

      const recipients = unique(
        desired === 1 ? (backups.length ? backups : fallback) : desired === 2 ? leads : admins,
      );
      if (!recipients.length) continue;

      const message = escalationNotification(row.id, row.tier, desired);
      await tx.insert(schema.notificationOutbox).values(
        recipients.map((toEmail) => ({
          kind: "crisis_escalation" as const,
          toEmail,
          subject: message.subject,
          body: message.body,
        })),
      );
      await tx
        .update(schema.crisisAlerts)
        .set({ escalationLevel: desired, escalatedAt: now })
        .where(and(eq(schema.crisisAlerts.id, row.id), eq(schema.crisisAlerts.escalationLevel, row.escalationLevel)));
      escalated++;
    }
    return escalated;
  });
}

/** Claims due messages, then sends outside the claim transaction. */
export async function processOutbox(
  now = new Date(),
  send: (message: EmailMessage) => Promise<DeliveryResult> = sendEmail,
): Promise<{ claimed: number; sent: number; failed: number }> {
  const db = await getDb();
  await db
    .update(schema.notificationOutbox)
    .set({ status: "pending", claimedAt: null })
    .where(and(eq(schema.notificationOutbox.status, "sending"), lte(schema.notificationOutbox.claimedAt, new Date(now.getTime() - STALE_CLAIM_MS))));

  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(schema.notificationOutbox)
      .where(and(eq(schema.notificationOutbox.status, "pending"), lte(schema.notificationOutbox.nextAttemptAt, now)))
      .orderBy(asc(schema.notificationOutbox.createdAt))
      .limit(20)
      .for("update", { skipLocked: true });
    if (!rows.length) return [];
    await tx
      .update(schema.notificationOutbox)
      .set({ status: "sending", claimedAt: now })
      .where(inArray(schema.notificationOutbox.id, rows.map((r) => r.id)));
    return rows;
  });

  let sent = 0;
  let failed = 0;
  for (const row of claimed) {
    const result = await send({ to: row.toEmail, subject: row.subject, text: row.body });
    if (result.ok) {
      await db
        .update(schema.notificationOutbox)
        .set({ status: "sent", sentAt: now, attempts: row.attempts + 1, lastError: null })
        .where(eq(schema.notificationOutbox.id, row.id));
      sent++;
      continue;
    }
    const attempts = row.attempts + 1;
    const dead = attempts >= MAX_DELIVERY_ATTEMPTS;
    const delay = RETRY_MINUTES[Math.min(attempts - 1, RETRY_MINUTES.length - 1)];
    await db
      .update(schema.notificationOutbox)
      .set({
        status: dead ? "dead" : "pending",
        attempts,
        lastError: result.error.slice(0, 500),
        nextAttemptAt: new Date(now.getTime() + delay * 60_000),
        claimedAt: null,
      })
      .where(eq(schema.notificationOutbox.id, row.id));
    failed++;
  }
  return { claimed: claimed.length, sent, failed };
}
