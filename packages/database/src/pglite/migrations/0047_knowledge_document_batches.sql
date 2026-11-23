CREATE TABLE "knowledge_document_batches" (
    "id" text PRIMARY KEY,
    "knowledge_model_id" text NOT NULL REFERENCES "knowledge_models" ("id") ON DELETE CASCADE,
    "created_by" text NOT NULL,
    "elapsed_ms" integer NOT NULL,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "first_peer_use_at" timestamptz,
    "documents" jsonb NOT NULL DEFAULT '[]'::jsonb
);
--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "generation_batch_id" text REFERENCES "knowledge_document_batches" ("id"), ADD COLUMN "schema_evidence" jsonb;
