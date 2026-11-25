CREATE TABLE "knowledge_document_generation_tasks" (
    "id" text PRIMARY KEY,
    "organization_id" text NOT NULL,
    "knowledge_model_id" text NOT NULL REFERENCES "knowledge_models" ("id") ON DELETE CASCADE,
    "created_by" text NOT NULL,
    "input" jsonb NOT NULL,
    "folder_id" text,
    "status" text NOT NULL DEFAULT 'queued',
    "phase" text NOT NULL DEFAULT 'queued',
    "completed_tables" integer NOT NULL DEFAULT 0,
    "total_tables" integer NOT NULL,
    "draft" jsonb,
    "error" text,
    "execution_context" text,
    "submission_id" text NOT NULL,
    "attempts" integer NOT NULL DEFAULT 0,
    "lease_token" text,
    "lease_expires_at" timestamptz,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    "documents" jsonb NOT NULL DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE INDEX "idx_document_generation_owner" ON "knowledge_document_generation_tasks" ("organization_id", "created_by", "created_at");
--> statement-breakpoint
CREATE INDEX "idx_document_generation_queue" ON "knowledge_document_generation_tasks" ("status", "created_at");
