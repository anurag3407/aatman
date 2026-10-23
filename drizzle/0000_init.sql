CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pseudonym" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tier" text NOT NULL,
	"payload_enc" text NOT NULL,
	"summary_enc" text,
	"summary_source" text,
	"keep" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pseudonym" text NOT NULL,
	"checkin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tier" text NOT NULL,
	"contact_enc" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"handled_by" text,
	"contacted_at" timestamp with time zone,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"counsellor_email" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"location" text NOT NULL,
	"mode" text DEFAULT 'in_person' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"booked_by" text,
	"booked_at" timestamp with time zone,
	"shared_checkin_id" uuid,
	"contact_enc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"pseudonym" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consent_version" text,
	"consent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_pseudonym_students_pseudonym_fk" FOREIGN KEY ("pseudonym") REFERENCES "public"."students"("pseudonym") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_pseudonym_students_pseudonym_fk" FOREIGN KEY ("pseudonym") REFERENCES "public"."students"("pseudonym") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_checkin_id_checkins_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."checkins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_booked_by_students_pseudonym_fk" FOREIGN KEY ("booked_by") REFERENCES "public"."students"("pseudonym") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_shared_checkin_id_checkins_id_fk" FOREIGN KEY ("shared_checkin_id") REFERENCES "public"."checkins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "checkins_owner_idx" ON "checkins" USING btree ("pseudonym","created_at");--> statement-breakpoint
CREATE INDEX "checkins_created_idx" ON "checkins" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "contact_requests_status_idx" ON "contact_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "slots_time_idx" ON "slots" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "slots_booker_idx" ON "slots" USING btree ("booked_by");