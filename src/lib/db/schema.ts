import { bigint, boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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

export const ALERT_STATUS = ["open", "acknowledged", "resolved"] as const;
export const ALERT_TIERS = ["crisis", "urgent"] as const;

/**
 * A crisis/urgent check-in that needs a human owner. It deliberately holds no answers,
 * scores, free text or contact details: the alert is a pointer, not a record.
 */
export const crisisAlerts = pgTable(
  "crisis_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pseudonym: text("pseudonym")
      .notNull()
      .references(() => students.pseudonym, { onDelete: "cascade" }),
    checkinId: uuid("checkin_id").references(() => checkins.id, { onDelete: "set null" }),
    contactRequestId: uuid("contact_request_id").references(() => contactRequests.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    tier: text("tier", { enum: ALERT_TIERS }).notNull(),
    status: text("status", { enum: ALERT_STATUS }).notNull().default("open"),
    acknowledgedAt: ts("acknowledged_at"),
    acknowledgedBy: text("acknowledged_by"),
    escalatedAt: ts("escalated_at"),
    escalationLevel: integer("escalation_level").notNull().default(0),
    resolvedAt: ts("resolved_at"),
    resolvedBy: text("resolved_by"),
    noteEnc: text("note_enc"),
  },
  (t) => [
    index("crisis_alerts_open_idx").on(t.status, t.createdAt),
    index("crisis_alerts_pseudonym_idx").on(t.pseudonym, t.createdAt),
  ],
);

/** Who is on call for crisis acknowledgement. Windows are inclusive of `starts_at`, exclusive of `ends_at`. */
export const onCallShifts = pgTable(
  "on_call_shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffEmail: text("staff_email").notNull(),
    role: text("role", { enum: ["counsellor", "clinical_lead"] }).notNull().default("counsellor"),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    backupEmail: text("backup_email"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("on_call_window_idx").on(t.startsAt, t.endsAt)],
);

export const OUTBOX_STATUS = ["pending", "sending", "sent", "dead"] as const;
export const OUTBOX_KINDS = ["crisis_alert", "crisis_escalation"] as const;

/**
 * Transactional outbox for notifications. Rows are PII-free by contract: an opaque
 * alert id and a staff URL, nothing about the student.
 */
export const notificationOutbox = pgTable(
  "notification_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind", { enum: OUTBOX_KINDS }).notNull(),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status", { enum: OUTBOX_STATUS }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    claimedAt: ts("claimed_at"),
    sentAt: ts("sent_at"),
    lastError: text("last_error"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("outbox_due_idx").on(t.status, t.nextAttemptAt)],
);

/** Public counsellor directory. Slots link by email so existing rows keep working. */
export const counsellors = pgTable("counsellors", {
  email: text("email").primaryKey(),
  displayName: text("display_name").notNull(),
  /** Free text, e.g. "Hindi, English, Marathi". */
  languages: text("languages").notNull().default(""),
  bio: text("bio"),
  active: boolean("active").notNull().default(true),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

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
    /** Held back from the general booking list; offered after an elevated or higher check-in. */
    isUrgent: boolean("is_urgent").notNull().default(false),
    /** Student opted in to SMS reminders when booking. Requires a phone number. */
    reminderOptIn: boolean("reminder_opt_in").notNull().default(false),
    reminder24AttemptAt: ts("reminder_24_attempt_at"),
    reminder24SentAt: ts("reminder_24_sent_at"),
    reminder2AttemptAt: ts("reminder_2_attempt_at"),
    reminder2SentAt: ts("reminder_2_sent_at"),
    attendedAt: ts("attended_at"),
    noShowAt: ts("no_show_at"),
    markedBy: text("marked_by"),
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

/**
 * Fixed-window rate-limit counters, shared by every app instance. Keys are hashed, so a
 * row doesn't name the student; rows are swept by the daily retention job.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    /** Epoch milliseconds. */
    windowStart: bigint("window_start", { mode: "number" }).notNull(),
    count: integer("count").notNull(),
  },
  (t) => [index("rate_limits_window_idx").on(t.windowStart)],
);
