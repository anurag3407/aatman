CREATE TABLE "crisis_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pseudonym" text NOT NULL,
	"checkin_id" uuid,
	"contact_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tier" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by" text,
	"escalated_at" timestamp with time zone,
	"escalation_level" integer DEFAULT 0 NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"note_enc" text
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "on_call_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_email" text NOT NULL,
	"role" text DEFAULT 'counsellor' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"backup_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crisis_alerts" ADD CONSTRAINT "crisis_alerts_pseudonym_students_pseudonym_fk" FOREIGN KEY ("pseudonym") REFERENCES "public"."students"("pseudonym") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crisis_alerts" ADD CONSTRAINT "crisis_alerts_checkin_id_checkins_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."checkins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crisis_alerts" ADD CONSTRAINT "crisis_alerts_contact_request_id_contact_requests_id_fk" FOREIGN KEY ("contact_request_id") REFERENCES "public"."contact_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crisis_alerts_open_idx" ON "crisis_alerts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "crisis_alerts_pseudonym_idx" ON "crisis_alerts" USING btree ("pseudonym","created_at");--> statement-breakpoint
CREATE INDEX "outbox_due_idx" ON "notification_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "on_call_window_idx" ON "on_call_shifts" USING btree ("starts_at","ends_at");