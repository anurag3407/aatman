import "server-only";
import { getDb, schema } from "@/lib/db";

export type AuditAction =
  | "staff_login"
  | "view_contact_request"
  | "update_contact_request"
  | "view_booking"
  | "view_alert"
  | "acknowledge_alert"
  | "resolve_alert"
  | "create_on_call"
  | "update_counsellor"
  | "mark_attendance"
  | "reschedule_booking"
  | "create_slots"
  | "cancel_slot"
  | "student_erased"
  | "retention_run";

/** Records who did what to which record. Never pass student data here, only ids. */
export async function recordAudit(actor: string, action: AuditAction, targetType?: string, targetId?: string) {
  const db = await getDb();
  await db.insert(schema.auditLog).values({ actor, action, targetType, targetId });
}
