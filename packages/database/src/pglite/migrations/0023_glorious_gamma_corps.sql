ALTER TABLE "work_investigations" ADD COLUMN "audit_status" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "work_investigations" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "work_investigations" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "work_investigations" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "work_investigations" ADD COLUMN "audit_status_updated_at" timestamp with time zone;
