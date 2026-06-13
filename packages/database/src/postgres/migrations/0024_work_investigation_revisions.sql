ALTER TABLE "works" ADD COLUMN "conclusion_status" text DEFAULT 'missing' NOT NULL;--> statement-breakpoint
ALTER TABLE "works" ADD COLUMN "conclusion_updated_at" timestamp with time zone;--> statement-breakpoint
UPDATE "works"
SET
    "conclusion_status" = CASE WHEN "conclusion" IS NULL OR btrim("conclusion") = '' THEN 'missing' ELSE 'fresh' END,
    "conclusion_updated_at" = CASE WHEN "conclusion" IS NULL OR btrim("conclusion") = '' THEN NULL ELSE "updated_at" END;--> statement-breakpoint
ALTER TABLE "work_investigations" ADD COLUMN "current_revision_id" text;--> statement-breakpoint
CREATE TABLE "work_investigation_revisions" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "work_id" text NOT NULL,
    "investigation_id" text NOT NULL,
    "version" integer NOT NULL,
    "instruction" text,
    "title" text NOT NULL,
    "findings_snapshot" jsonb NOT NULL,
    "asset_summary" jsonb NOT NULL,
    "run_id" text,
    "created_by" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "idx_work_investigation_revisions_work" ON "work_investigation_revisions" USING btree ("organization_id","work_id");--> statement-breakpoint
CREATE INDEX "idx_work_investigation_revisions_investigation" ON "work_investigation_revisions" USING btree ("organization_id","investigation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_work_investigation_revisions_version" ON "work_investigation_revisions" USING btree ("investigation_id","version");
