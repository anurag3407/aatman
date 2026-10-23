import "server-only";
import { and, eq, gte, isNotNull, isNull, lt, lte, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { formatDate } from "@/lib/i18n";
import { sendSms, type DeliveryResult, type SmsMessage } from "@/lib/notify";
import { unseal } from "@/lib/privacy/server";

const HOUR = 3_600_000;
const THROTTLE_MS = 15 * 60_000;

/**
 * Sends neutral SMS reminders about 24 hours and 2 hours before a booked session.
 * The phone number is decrypted in memory only; it is never written to the outbox.
 */
export async function runAppointmentReminders(
  now = new Date(),
  send: (message: SmsMessage) => Promise<DeliveryResult> = sendSms,
): Promise<{ sent: number; failed: number }> {
  const db = await getDb();
  let sent = 0;
  let failed = 0;

  const windows = [
    {
      from: new Date(now.getTime() + 22 * HOUR),
      to: new Date(now.getTime() + 26 * HOUR),
      attempted: schema.slots.reminder24AttemptAt,
      sentAt: schema.slots.reminder24SentAt,
      mark: (attempt: Date, ok: boolean) =>
        ok
          ? { reminder24AttemptAt: attempt, reminder24SentAt: attempt }
          : { reminder24AttemptAt: attempt },
    },
    {
      from: new Date(now.getTime() + 1.5 * HOUR),
      to: new Date(now.getTime() + 2.5 * HOUR),
      attempted: schema.slots.reminder2AttemptAt,
      sentAt: schema.slots.reminder2SentAt,
      mark: (attempt: Date, ok: boolean) =>
        ok ? { reminder2AttemptAt: attempt, reminder2SentAt: attempt } : { reminder2AttemptAt: attempt },
    },
  ];

  for (const window of windows) {
    const rows = await db
      .select()
      .from(schema.slots)
      .where(
        and(
          eq(schema.slots.status, "booked"),
          eq(schema.slots.reminderOptIn, true),
          isNotNull(schema.slots.contactEnc),
          isNotNull(schema.slots.bookedBy),
          gte(schema.slots.startsAt, window.from),
          lte(schema.slots.startsAt, window.to),
          isNull(window.sentAt),
          or(isNull(window.attempted), lt(window.attempted, new Date(now.getTime() - THROTTLE_MS))),
        ),
      );

    for (const row of rows) {
      if (!row.bookedBy || !row.contactEnc) continue;
      let phone: string;
      try {
        phone = unseal<{ phone: string }>(row.contactEnc, row.bookedBy).phone;
      } catch {
        continue;
      }
      const when = formatDate(row.startsAt, "en", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      });
      const result = await send({ to: phone, text: `Reminder: your appointment is on ${when}.` });
      await db
        .update(schema.slots)
        .set(window.mark(now, result.ok))
        .where(eq(schema.slots.id, row.id));
      if (result.ok) sent++;
      else failed++;
    }
  }

  return { sent, failed };
}
