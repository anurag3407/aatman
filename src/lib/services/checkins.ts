import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { CampusAnswers } from "@/lib/checkin/flow";
import { getDb, schema } from "@/lib/db";
import type { Locale } from "@/lib/i18n";
import type { Summary } from "@/lib/llm";
import { seal, unseal } from "@/lib/privacy/server";
import { triage, type CheckinAnswers, type TriageResult } from "@/lib/safety/triage";
import { alertNotification, getAlertRecipients, type AlertTier } from "./alerts";

/** What's encrypted per check-in. Free text is never in here: it's scanned, then dropped. */
export interface CheckinPayload {
  answers: Omit<CheckinAnswers, "freeText">;
  campus: CampusAnswers;
  triage: PublicTriage;
  locale: Locale;
}

/** Triage minus the free-text detection details (matched rule ids would hint at what was written). */
export type PublicTriage = Omit<TriageResult, "textDetection">;

export function toPublicTriage(t: TriageResult): PublicTriage {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { textDetection, ...rest } = t;
  return rest;
}

export interface CheckinRecord extends CheckinPayload {
  id: string;
  createdAt: Date;
  keep: boolean;
  summary: Summary | null;
}

/** Re-scores on the server (client results are never trusted), then stores the encrypted payload. */
export async function createCheckin(
  pseudonym: string,
  input: { answers: CheckinAnswers; campus: CampusAnswers; locale: Locale },
): Promise<{ id: string; createdAt: Date; triage: PublicTriage }> {
  const result = toPublicTriage(triage(input.answers));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { freeText, ...answers } = input.answers;
  const payload: CheckinPayload = { answers, campus: input.campus, triage: result, locale: input.locale };

  const alertTier: AlertTier | null = result.tier === "crisis" || result.tier === "urgent" ? result.tier : null;
  const recipients = alertTier ? await getAlertRecipients() : [];

  const db = await getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.checkins)
      .values({ pseudonym, tier: result.tier, payloadEnc: seal(payload, pseudonym) })
      .returning({ id: schema.checkins.id, createdAt: schema.checkins.createdAt });

    if (alertTier) {
      const [alert] = await tx
        .insert(schema.crisisAlerts)
        .values({ pseudonym, checkinId: row.id, tier: alertTier })
        .returning({ id: schema.crisisAlerts.id });
      if (recipients.length) {
        const message = alertNotification(alert.id, alertTier);
        await tx.insert(schema.notificationOutbox).values(
          recipients.map((toEmail) => ({
            kind: "crisis_alert" as const,
            toEmail,
            subject: message.subject,
            body: message.body,
          })),
        );
      }
    }

    return { ...row, triage: result };
  });
}

type CheckinRow = typeof schema.checkins.$inferSelect;

function toRecord(row: CheckinRow): CheckinRecord {
  return {
    id: row.id,
    createdAt: row.createdAt,
    keep: row.keep,
    summary:
      row.summaryEnc && row.summarySource
        ? { text: unseal<string>(row.summaryEnc, row.pseudonym), source: row.summarySource }
        : null,
    ...unseal<CheckinPayload>(row.payloadEnc, row.pseudonym),
  };
}

export async function getCheckin(pseudonym: string, id: string): Promise<CheckinRecord | null> {
  if (!isUuid(id)) return null;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.checkins)
    .where(and(eq(schema.checkins.id, id), eq(schema.checkins.pseudonym, pseudonym)));
  return row ? toRecord(row) : null;
}

export async function listCheckins(pseudonym: string): Promise<CheckinRecord[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.checkins)
    .where(eq(schema.checkins.pseudonym, pseudonym))
    .orderBy(desc(schema.checkins.createdAt));
  return rows.map(toRecord);
}

export async function latestCheckin(pseudonym: string): Promise<CheckinRecord | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.checkins)
    .where(eq(schema.checkins.pseudonym, pseudonym))
    .orderBy(desc(schema.checkins.createdAt))
    .limit(1);
  return row ? toRecord(row) : null;
}

export async function saveSummary(pseudonym: string, id: string, summary: Summary): Promise<void> {
  const db = await getDb();
  await db
    .update(schema.checkins)
    .set({ summaryEnc: seal(summary.text, pseudonym), summarySource: summary.source })
    .where(and(eq(schema.checkins.id, id), eq(schema.checkins.pseudonym, pseudonym)));
}

export async function setKeep(pseudonym: string, id: string, keep: boolean): Promise<boolean> {
  if (!isUuid(id)) return false;
  const db = await getDb();
  const rows = await db
    .update(schema.checkins)
    .set({ keep })
    .where(and(eq(schema.checkins.id, id), eq(schema.checkins.pseudonym, pseudonym)))
    .returning({ id: schema.checkins.id });
  return rows.length > 0;
}

export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
