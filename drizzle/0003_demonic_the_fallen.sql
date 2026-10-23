CREATE TABLE "counsellors" (
	"email" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"languages" text DEFAULT '' NOT NULL,
	"bio" text,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slots" ADD COLUMN "is_urgent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "slots" ADD COLUMN "reminder_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "slots" ADD COLUMN "reminder_24_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "slots" ADD COLUMN "reminder_24_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "slots" ADD COLUMN "reminder_2_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "slots" ADD COLUMN "reminder_2_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "slots" ADD COLUMN "attended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "slots" ADD COLUMN "no_show_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "slots" ADD COLUMN "marked_by" text;