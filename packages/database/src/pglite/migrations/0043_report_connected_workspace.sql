ALTER TABLE "report_working_drafts" ADD COLUMN "id" text;
--> statement-breakpoint
UPDATE "report_working_drafts" SET "id" = 'draft_' || md5("document_id" || ':' || "user_id" || ':' || "base_revision"::text);
--> statement-breakpoint
ALTER TABLE "report_working_drafts" ALTER COLUMN "id" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "report_working_drafts_id" ON "report_working_drafts" ("id");
--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "visibility" text NOT NULL DEFAULT 'catalog';
