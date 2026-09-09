CREATE TABLE "semantic_model_knowledge_sources" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "semantic_model_id" text NOT NULL REFERENCES "semantic_models"("id") ON DELETE CASCADE,
    "connection_id" text REFERENCES "connections"("id") ON DELETE SET NULL,
    "file_name" text NOT NULL,
    "format" text NOT NULL,
    "content_text" text NOT NULL,
    "byte_size" integer NOT NULL,
    "created_by" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_semantic_knowledge_sources_model_file" ON "semantic_model_knowledge_sources" USING btree ("semantic_model_id", "file_name");
--> statement-breakpoint
CREATE INDEX "idx_semantic_knowledge_sources_org_model" ON "semantic_model_knowledge_sources" USING btree ("organization_id", "semantic_model_id");
--> statement-breakpoint
CREATE INDEX "idx_semantic_knowledge_sources_connection" ON "semantic_model_knowledge_sources" USING btree ("connection_id");
