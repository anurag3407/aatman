import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Privacy model:
 * - No email, name or roll number is stored for students. `pseudonym` is HMAC(email).
 * - Answers, scores, summaries and any contact details are AES-GCM encrypted (`*_enc`),
 *   bound to the owner's pseudonym, so a DB dump alone reveals only tiers and timestamps.
 * - `tier` and `created_at` stay plaintext so the admin dashboard can aggregate (k ≥ 10).
 */

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const TIER_VALUES = ["mild", "moderate", "elevated", "urgent", "crisis"] as const;

export const students = pgTable("students", {
  pseudonym: text("pseudonym").primaryKey(),
  createdAt: ts("created_at").notNull().defaultNow(),
  consentVersion: text("consent_version"),
  consentAt: ts("consent_at"),
});

export const checkins = pgTable(
  "checkins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pseudonym: text("pseudonym")
      .notNull()
      .references(() => students.pseudonym, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    tier: text("tier", { enum: TIER_VALUES }).notNull(),
    payloadEnc: text("payload_enc").notNull(),
    summaryEnc: text("summary_enc"),
    summarySource: text("summary_source", { enum: ["llm", "template"] }),
    /** Exempt from automatic retention deletion, at the student's request. */
    keep: boolean("keep").notNull().default(false),
  },
  (t) => [index("checkins_owner_idx").on(t.pseudonym, t.createdAt), index("checkins_created_idx").on(t.createdAt)],
);

export const CONTACT_STATUS = ["new", "contacted", "closed"] as const;

/** "Please contact me": the student's explicit, per-request opt-in to share with the counselling team. */
export const contactRequests = pgTable(
  "contact_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pseudonym: text("pseudonym")
      .notNull()
      .references(() => students.pseudonym, { onDelete: "cascade" }),
    checkinId: uuid("checkin_id").references(() => checkins.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    tier: text("tier", { enum: TIER_VALUES }).notNull(),
    contactEnc: text("contact_enc").notNull(),
    status: text("status", { enum: CONTACT_STATUS }).notNull().default("new"),
    handledBy: text("handled_by"),
    contactedAt: ts("contacted_at"),
    closedAt: ts("closed_at"),
  },
  (t) => [index("contact_requests_status_idx").on(t.status, t.createdAt)],
);

export const SLOT_STATUS = ["open", "booked", "cancelled"] as const;
export const SLOT_MODES = ["in_person", "phone", "video"] as const;

export const slots = pgTable(
  "slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    counsellorEmail: text("counsellor_email").notNull(),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    location: text("location").notNull(),
    mode: text("mode", { enum: SLOT_MODES }).notNull().default("in_person"),
    status: text("status", { enum: SLOT_STATUS }).notNull().default("open"),
    bookedBy: text("booked_by").references(() => students.pseudonym, { onDelete: "set null" }),
    bookedAt: ts("booked_at"),
    /** Set only if the student ticked "share my latest check-in". */
    sharedCheckinId: uuid("shared_checkin_id").references(() => checkins.id, { onDelete: "set null" }),
    contactEnc: text("contact_enc"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("slots_time_idx").on(t.startsAt), index("slots_booker_idx").on(t.bookedBy)],
);

/** Who looked at or changed shared student data. Never contains the data itself. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: ts("at").notNull().defaultNow(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
  },
  (t) => [index("audit_log_at_idx").on(t.at)],
);
