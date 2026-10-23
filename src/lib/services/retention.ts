import "server-only";
import { and, eq, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { recordAudit } from "./audit";

export interface RetentionResult {
  checkins: number;
  contactRequests: number;
  slots: number;
  auditLog: number;
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

  const result = {
    checkins: checkins.length,
    contactRequests: contactRequests.length,
    slots: slots.length,
    auditLog: auditLog.length,
  };
  await recordAudit("system", "retention_run", "counts", JSON.stringify(result));
  return result;
}
