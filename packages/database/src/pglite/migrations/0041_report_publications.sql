ALTER TABLE "work_documents" ADD COLUMN "published_version_id" text;
--> statement-breakpoint
CREATE TABLE "report_snapshots" (
    "id" text PRIMARY KEY NOT NULL,
    "document_id" text NOT NULL REFERENCES "work_documents"("id") ON DELETE CASCADE,
    "evidence" jsonb NOT NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "report_snapshots_document" ON "report_snapshots" ("document_id");
--> statement-breakpoint
CREATE TABLE "report_publications" (
    "id" text PRIMARY KEY NOT NULL,
    "document_id" text NOT NULL REFERENCES "work_documents"("id") ON DELETE CASCADE,
    "number" integer NOT NULL,
    "revision" integer NOT NULL,
    "request_id" text NOT NULL,
    "title" text NOT NULL,
    "content" jsonb NOT NULL,
    "scope" jsonb NOT NULL,
    "chat_id" text,
    "published_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "report_publications_number" ON "report_publications" ("document_id", "number");
--> statement-breakpoint
CREATE UNIQUE INDEX "report_publications_request" ON "report_publications" ("document_id", "request_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "report_publications_revision" ON "report_publications" ("document_id", "revision");
