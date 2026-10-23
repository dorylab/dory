CREATE TABLE "work_documents" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "user_id" text NOT NULL,
    "creation_key" text NOT NULL,
    "chat_id" text,
    "title" text NOT NULL,
    "scope" jsonb NOT NULL,
    "content" jsonb NOT NULL,
    "revision" integer DEFAULT 1 NOT NULL,
    "status" text DEFAULT 'draft' NOT NULL,
    "archived_at" timestamptz,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "work_documents_creation_key" ON "work_documents" ("organization_id", "user_id", "creation_key");
--> statement-breakpoint
CREATE INDEX "work_documents_owner_updated" ON "work_documents" ("organization_id", "user_id", "updated_at");
--> statement-breakpoint
CREATE TABLE "work_document_versions" (
    "document_id" text NOT NULL REFERENCES "work_documents"("id") ON DELETE CASCADE,
    "revision" integer NOT NULL,
    "title" text NOT NULL,
    "content" jsonb NOT NULL,
    "scope" jsonb NOT NULL,
    "status" text NOT NULL,
    "source" text NOT NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY ("document_id", "revision")
);
