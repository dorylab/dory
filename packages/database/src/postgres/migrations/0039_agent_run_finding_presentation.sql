ALTER TABLE "findings" ADD COLUMN "presentation" jsonb;
--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "verified_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "verified_by_user_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_findings_primary_per_work" ON "findings" USING btree ("organization_id", "work_id") WHERE "is_primary" = true;
