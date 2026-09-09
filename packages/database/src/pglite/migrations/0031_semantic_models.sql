DROP TABLE IF EXISTS "semantic_verified_queries";
--> statement-breakpoint
DROP TABLE IF EXISTS "semantic_contexts";
--> statement-breakpoint
CREATE TABLE "semantic_models" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "business_context_md" text DEFAULT '' NOT NULL,
    "model_yaml" text DEFAULT 'cubes: []\n' NOT NULL,
    "model_json" jsonb DEFAULT '{"definitions":[]}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_semantic_models_org_name" ON "semantic_models" USING btree ("organization_id", "name");
--> statement-breakpoint
CREATE INDEX "idx_semantic_models_org_updated" ON "semantic_models" USING btree ("organization_id", "updated_at");
--> statement-breakpoint
CREATE TABLE "semantic_model_sources" (
    "semantic_model_id" text NOT NULL REFERENCES "semantic_models"("id") ON DELETE CASCADE,
    "connection_id" text NOT NULL REFERENCES "connections"("id") ON DELETE CASCADE,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "pk_semantic_model_sources" PRIMARY KEY("semantic_model_id", "connection_id")
);
--> statement-breakpoint
CREATE INDEX "idx_semantic_model_sources_connection" ON "semantic_model_sources" USING btree ("connection_id");
--> statement-breakpoint
CREATE TABLE "semantic_verified_queries" (
    "id" text PRIMARY KEY NOT NULL,
    "semantic_model_id" text NOT NULL REFERENCES "semantic_models"("id") ON DELETE CASCADE,
    "source_connection_id" text NOT NULL REFERENCES "connections"("id") ON DELETE CASCADE,
    "title" text NOT NULL,
    "question" text NOT NULL,
    "sql" text NOT NULL,
    "description" text,
    "definition_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "source_type" text DEFAULT 'manual' NOT NULL,
    "source_id" text,
    "created_by" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_semantic_verified_queries_model_updated" ON "semantic_verified_queries" USING btree ("semantic_model_id", "updated_at");
--> statement-breakpoint
CREATE INDEX "idx_semantic_verified_queries_connection" ON "semantic_verified_queries" USING btree ("source_connection_id");
