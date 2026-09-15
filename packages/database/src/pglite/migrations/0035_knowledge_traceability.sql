CREATE TABLE "knowledge_asset_sources" (
    "knowledge_model_id" text NOT NULL REFERENCES "knowledge_models"("id") ON DELETE cascade,
    "knowledge_source_id" text NOT NULL REFERENCES "knowledge_sources"("id") ON DELETE cascade,
    "asset_type" text NOT NULL,
    "asset_id" text NOT NULL,
    "relation_type" text NOT NULL,
    "created_by" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "pk_knowledge_asset_sources" PRIMARY KEY("knowledge_source_id", "asset_type", "asset_id")
);
--> statement-breakpoint
CREATE INDEX "idx_knowledge_asset_sources_model_asset" ON "knowledge_asset_sources" ("knowledge_model_id", "asset_type", "asset_id");
--> statement-breakpoint
CREATE TABLE "work_knowledge_assets" (
    "work_id" text NOT NULL REFERENCES "works"("work_id") ON DELETE cascade,
    "organization_id" text NOT NULL,
    "user_id" text NOT NULL,
    "knowledge_model_id" text NOT NULL,
    "asset_type" text NOT NULL,
    "asset_id" text NOT NULL,
    "asset_snapshot" jsonb NOT NULL,
    "use_count" integer DEFAULT 1 NOT NULL,
    "first_used_at" timestamp with time zone DEFAULT now() NOT NULL,
    "last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "pk_work_knowledge_assets" PRIMARY KEY("work_id", "asset_type", "asset_id")
);
--> statement-breakpoint
CREATE INDEX "idx_work_knowledge_assets_work_used" ON "work_knowledge_assets" ("work_id", "last_used_at");
