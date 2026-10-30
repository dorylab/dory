CREATE TABLE "report_working_drafts" (
    "document_id" text NOT NULL REFERENCES "work_documents"("id") ON DELETE CASCADE,
    "organization_id" text NOT NULL,
    "user_id" text NOT NULL,
    "base_revision" integer NOT NULL,
    "expected_report_revision" integer NOT NULL,
    "revision" integer NOT NULL DEFAULT 1,
    "state" jsonb NOT NULL,
    "results" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY ("document_id", "user_id", "base_revision")
);
