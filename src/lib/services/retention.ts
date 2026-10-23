import "server-only";
import { and, eq, inArray, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { recordAudit } from "./audit";
import { sweepRateLimits } from "./rateLimit";

export interface RetentionResult {
  checkins: number;
  contactRequests: number;
  slots: number;
  auditLog: number;
  rateLimits: number;
  alerts: number;
  notifications: number;
  onCallShifts: number;
}

/** Deletes data past its retention period. Run daily via POST /api/cron/retention. */
export async function runRetention(months: number, now = new Date()): Promise<RetentionResult> {
  const db = await getDb();
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  const auditCutoff = new Date(now);
  auditCutoff.setMonth(auditCutoff.getMonth() - 36);

  const checkins = await db
    .delete(schema.checkins)
    .where(and(lt(schema.checkins.createdAt, cutoff), eq(schema.checkins.keep, false)))
    .returning({ id: schema.checkins.id });
  const contactRequests = await db
    .delete(schema.contactRequests)
    .where(and(lt(schema.contactRequests.createdAt, cutoff), eq(schema.contactRequests.status, "closed")))
    .returning({ id: schema.contactRequests.id });
  const slots = await db.delete(schema.slots).where(lt(schema.slots.endsAt, cutoff)).returning({ id: schema.slots.id });
  const auditLog = await db.delete(schema.auditLog).where(lt(schema.auditLog.at, auditCutoff)).returning({ id: schema.auditLog.id });
  const alerts = await db
    .delete(schema.crisisAlerts)
    .where(and(eq(schema.crisisAlerts.status, "resolved"), lt(schema.crisisAlerts.resolvedAt, cutoff)))
    .returning({ id: schema.crisisAlerts.id });
  const notifications = await db
    .delete(schema.notificationOutbox)
    .where(
      and(
        inArray(schema.notificationOutbox.status, ["sent", "dead"]),
        lt(schema.notificationOutbox.createdAt, new Date(now.getTime() - 30 * 86_400_000)),
      ),
    )
    .returning({ id: schema.notificationOutbox.id });
  const onCallShifts = await db
    .delete(schema.onCallShifts)
    .where(lt(schema.onCallShifts.endsAt, new Date(now.getTime() - 90 * 86_400_000)))
    .returning({ id: schema.onCallShifts.id });

  // Every limiter window is at most an hour; a day's margin keeps sweeping trivially safe.
  const rateLimits = await sweepRateLimits(24 * 60 * 60 * 1000, now.getTime());

  const result = {
    checkins: checkins.length,
    contactRequests: contactRequests.length,
    slots: slots.length,
    auditLog: auditLog.length,
    rateLimits,
    alerts: alerts.length,
    notifications: notifications.length,
    onCallShifts: onCallShifts.length,
  };
  await recordAudit("system", "retention_run", "counts", JSON.stringify(result));
  return result;
}
