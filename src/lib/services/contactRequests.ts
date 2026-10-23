import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { seal, unseal } from "@/lib/privacy/server";
import { recordAudit } from "./audit";
import { getCheckin, latestCheckin, type CheckinRecord } from "./checkins";

export interface ContactDetails {
  name?: string;
  phone?: string;
  email?: string;
  bestTime?: string;
}

export const MAX_OPEN_REQUESTS = 3;

export type CreateContactResult = { ok: true; id: string } | { ok: false; error: "no_checkin" | "too_many" };

/**
 * The student's explicit opt-in to be contacted. It shares their latest (or the given)
 * check-in and the contact details they typed in, and nothing else.
 */
export async function createContactRequest(
  pseudonym: string,
  contact: ContactDetails,
  checkinId?: string,
): Promise<CreateContactResult> {
  const checkin = checkinId ? await getCheckin(pseudonym, checkinId) : await latestCheckin(pseudonym);
  if (!checkin) return { ok: false, error: "no_checkin" };

  const db = await getDb();
  const open = await db
    .select({ id: schema.contactRequests.id })
    .from(schema.contactRequests)
    .where(and(eq(schema.contactRequests.pseudonym, pseudonym), inArray(schema.contactRequests.status, ["new", "contacted"])));
  if (open.length >= MAX_OPEN_REQUESTS) return { ok: false, error: "too_many" };

  const [row] = await db
    .insert(schema.contactRequests)
    .values({ pseudonym, checkinId: checkin.id, tier: checkin.triage.tier, contactEnc: seal(contact, pseudonym) })
    .returning({ id: schema.contactRequests.id });

  // If a crisis/urgent alert is open, point it at the callback details the student just shared.
  await db
    .update(schema.crisisAlerts)
    .set({ contactRequestId: row.id })
    .where(
      and(
        eq(schema.crisisAlerts.pseudonym, pseudonym),
        isNull(schema.crisisAlerts.contactRequestId),
        inArray(schema.crisisAlerts.status, ["open", "acknowledged"]),
      ),
    );
  return { ok: true, id: row.id };
}

export interface ContactRequestSummary {
  id: string;
  createdAt: Date;
  tier: (typeof schema.TIER_VALUES)[number];
  status: (typeof schema.CONTACT_STATUS)[number];
  handledBy: string | null;
}

const TIER_ORDER = { crisis: 0, urgent: 1, elevated: 2, moderate: 3, mild: 4 } as const;

/** Queue view: no contact details or scores, so nothing needs decrypting or auditing. */
export async function listContactRequests(statuses: ContactRequestSummary["status"][]): Promise<ContactRequestSummary[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: schema.contactRequests.id,
      createdAt: schema.contactRequests.createdAt,
      tier: schema.contactRequests.tier,
      status: schema.contactRequests.status,
      handledBy: schema.contactRequests.handledBy,
    })
    .from(schema.contactRequests)
    .where(inArray(schema.contactRequests.status, statuses))
    .orderBy(desc(schema.contactRequests.createdAt));
  // Most severe first, then newest first.
  return rows.sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
}

export interface ContactRequestDetail extends ContactRequestSummary {
  contact: ContactDetails;
  checkin: CheckinRecord | null;
  contactedAt: Date | null;
}

/** Decrypts the shared data for a counsellor and records the access. */
export async function getContactRequestForStaff(id: string, actor: string): Promise<ContactRequestDetail | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.contactRequests).where(eq(schema.contactRequests.id, id));
  if (!row) return null;
  await recordAudit(actor, "view_contact_request", "contact_request", id);
  return {
    id: row.id,
    createdAt: row.createdAt,
    tier: row.tier,
    status: row.status,
    handledBy: row.handledBy,
    contactedAt: row.contactedAt,
    contact: unseal<ContactDetails>(row.contactEnc, row.pseudonym),
    checkin: row.checkinId ? await getCheckin(row.pseudonym, row.checkinId) : null,
  };
}

export async function updateContactRequestStatus(
  id: string,
  status: ContactRequestSummary["status"],
  actor: string,
): Promise<void> {
  const db = await getDb();
  const now = new Date();
  await db
    .update(schema.contactRequests)
    .set({
      status,
      handledBy: actor,
      ...(status === "contacted" ? { contactedAt: now } : {}),
      ...(status === "closed" ? { closedAt: now } : {}),
    })
    .where(eq(schema.contactRequests.id, id));
  await recordAudit(actor, "update_contact_request", "contact_request", id);
}

export async function listStudentContactRequests(pseudonym: string) {
  const db = await getDb();
  return db
    .select({
      id: schema.contactRequests.id,
      createdAt: schema.contactRequests.createdAt,
      status: schema.contactRequests.status,
    })
    .from(schema.contactRequests)
    .where(eq(schema.contactRequests.pseudonym, pseudonym))
    .orderBy(desc(schema.contactRequests.createdAt));
}
