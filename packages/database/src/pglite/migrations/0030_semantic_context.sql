CREATE TABLE "semantic_contexts" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "connection_id" text NOT NULL,
    "business_context_md" text DEFAULT '' NOT NULL,
    "model_yaml" text DEFAULT 'cubes: []\n' NOT NULL,
    "model_json" jsonb DEFAULT '{"definitions":[]}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_semantic_contexts_org_connection" ON "semantic_contexts" USING btree ("organization_id", "connection_id");
--> statement-breakpoint
CREATE INDEX "idx_semantic_contexts_org" ON "semantic_contexts" USING btree ("organization_id");
--> statement-breakpoint
CREATE TABLE "semantic_verified_queries" (
    "id" text PRIMARY KEY NOT NULL,
    "semantic_context_id" text NOT NULL,
    "title" text NOT NULL,
    "question" text NOT NULL,
    "sql" text NOT NULL,
    "description" text,
    "source_type" text DEFAULT 'manual' NOT NULL,
    "source_id" text,
    "created_by" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_semantic_verified_queries_context_created" ON "semantic_verified_queries" USING btree ("semantic_context_id", "created_at");
