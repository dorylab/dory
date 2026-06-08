ALTER TABLE "works" ADD COLUMN "work_type" text DEFAULT 'investigation' NOT NULL;--> statement-breakpoint
ALTER TABLE "works" ADD COLUMN "scope" jsonb;--> statement-breakpoint
ALTER TABLE "works" ADD COLUMN "initial_context" text;