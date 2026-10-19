CREATE TABLE "knowledge_models" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "business_context_md" text DEFAULT '' NOT NULL,
    "model_yaml" text DEFAULT 'version: 0.1.1\nsemantic_model:\n  - name: untitled_model\n    datasets:\n      - name: untitled_dataset\n        source: __unconfigured__\n' NOT NULL,
    "model_json" jsonb DEFAULT '{"version":"0.1.1","semantic_model":[{"name":"untitled_model","datasets":[{"name":"untitled_dataset","source":"__unconfigured__"}],"relationships":[],"metrics":[]}]}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_knowledge_models_org_name" ON "knowledge_models" ("organization_id", "name");
--> statement-breakpoint
CREATE INDEX "idx_knowledge_models_org_updated" ON "knowledge_models" ("organization_id", "updated_at");
--> statement-breakpoint
CREATE TABLE "knowledge_model_sources" (
    "knowledge_model_id" text NOT NULL REFERENCES "knowledge_models"("id") ON DELETE cascade,
    "connection_id" text NOT NULL REFERENCES "connections"("id") ON DELETE cascade,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "pk_knowledge_model_sources" PRIMARY KEY("knowledge_model_id", "connection_id")
);
--> statement-breakpoint
CREATE INDEX "idx_knowledge_model_sources_connection" ON "knowledge_model_sources" ("connection_id");
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "knowledge_model_id" text NOT NULL REFERENCES "knowledge_models"("id") ON DELETE cascade,
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
CREATE UNIQUE INDEX "uidx_knowledge_sources_model_file" ON "knowledge_sources" ("knowledge_model_id", "file_name");
--> statement-breakpoint
CREATE INDEX "idx_knowledge_sources_org_model" ON "knowledge_sources" ("organization_id", "knowledge_model_id");
--> statement-breakpoint
CREATE INDEX "idx_knowledge_sources_connection" ON "knowledge_sources" ("connection_id");
--> statement-breakpoint
CREATE TABLE "knowledge_verified_queries" (
    "id" text PRIMARY KEY NOT NULL,
    "knowledge_model_id" text NOT NULL REFERENCES "knowledge_models"("id") ON DELETE cascade,
    "source_connection_id" text NOT NULL REFERENCES "connections"("id") ON DELETE cascade,
    "title" text NOT NULL,
    "question" text NOT NULL,
    "sql" text NOT NULL,
    "description" text,
    "definition_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "source_type" text DEFAULT 'manual' NOT NULL,
    "source_id" text,
    "created_by" text,
    "updated_by" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_knowledge_verified_queries_model_updated" ON "knowledge_verified_queries" ("knowledge_model_id", "updated_at");
--> statement-breakpoint
CREATE INDEX "idx_knowledge_verified_queries_connection" ON "knowledge_verified_queries" ("source_connection_id");
--> statement-breakpoint
CREATE TABLE "knowledge_connectors" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "knowledge_model_id" text NOT NULL REFERENCES "knowledge_models"("id") ON DELETE cascade,
    "provider" text NOT NULL,
    "installation_id" text NOT NULL,
    "repository_id" text NOT NULL,
    "repository_full_name" text NOT NULL,
    "default_branch" text NOT NULL,
    "root_path" text DEFAULT '' NOT NULL,
    "status" text DEFAULT 'pending' NOT NULL,
    "last_commit_sha" text,
    "last_synced_at" timestamp with time zone,
    "last_error" text,
    "created_by" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_knowledge_connectors_model_repo_path" ON "knowledge_connectors" ("knowledge_model_id", "provider", "repository_id", "root_path");
--> statement-breakpoint
CREATE INDEX "idx_knowledge_connectors_org_model" ON "knowledge_connectors" ("organization_id", "knowledge_model_id");
--> statement-breakpoint
CREATE INDEX "idx_knowledge_connectors_installation_repo" ON "knowledge_connectors" ("installation_id", "repository_id");
--> statement-breakpoint
CREATE TABLE "knowledge_connector_items" (
    "connector_id" text NOT NULL REFERENCES "knowledge_connectors"("id") ON DELETE cascade,
    "knowledge_source_id" text NOT NULL REFERENCES "knowledge_sources"("id") ON DELETE cascade,
    "remote_path" text NOT NULL,
    "remote_sha" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "pk_knowledge_connector_items" PRIMARY KEY("connector_id", "remote_path")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_knowledge_connector_items_source" ON "knowledge_connector_items" ("knowledge_source_id");
--> statement-breakpoint
CREATE TABLE "knowledge_connector_sync_jobs" (
    "id" text PRIMARY KEY NOT NULL,
    "connector_id" text NOT NULL REFERENCES "knowledge_connectors"("id") ON DELETE cascade,
    "status" text DEFAULT 'queued' NOT NULL,
    "target_sha" text,
    "attempts" integer DEFAULT 0 NOT NULL,
    "error" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_knowledge_connector_sync_jobs_status_created" ON "knowledge_connector_sync_jobs" ("status", "created_at");
--> statement-breakpoint
CREATE INDEX "idx_knowledge_connector_sync_jobs_connector" ON "knowledge_connector_sync_jobs" ("connector_id");
--> statement-breakpoint
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
CREATE TABLE "agent_principals" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "name" text NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "allowed_connection_ids" jsonb,
    "created_by_user_id" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_agent_principals_org_created" ON "agent_principals" ("organization_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_agent_principals_org_name" ON "agent_principals" ("organization_id", "name");
--> statement-breakpoint
ALTER TABLE "mcp_access_tokens" ADD COLUMN "principal_type" text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
ALTER TABLE "mcp_access_tokens" ADD COLUMN "principal_id" text;
--> statement-breakpoint
ALTER TABLE "mcp_access_tokens" ADD COLUMN "allowed_connection_ids" jsonb;
--> statement-breakpoint
ALTER TABLE "mcp_access_tokens" ADD COLUMN "expires_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "mcp_access_tokens" SET "principal_id" = "created_by_user_id" WHERE "principal_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "works" ADD COLUMN "principal_type" text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
ALTER TABLE "works" ADD COLUMN "principal_id" text;
--> statement-breakpoint
UPDATE "works" SET "principal_id" = "user_id" WHERE "principal_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "work_events" ADD COLUMN "principal_type" text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
ALTER TABLE "work_events" ADD COLUMN "principal_id" text;
--> statement-breakpoint
UPDATE "work_events" SET "principal_id" = "user_id" WHERE "principal_id" IS NULL;
--> statement-breakpoint
CREATE TABLE "work_agent_assets" (
    "work_id" text NOT NULL REFERENCES "works"("work_id") ON DELETE cascade,
    "organization_id" text NOT NULL,
    "user_id" text NOT NULL,
    "principal_type" text DEFAULT 'user' NOT NULL,
    "principal_id" text,
    "asset_kind" text NOT NULL,
    "asset_ref" text NOT NULL,
    "revision" text NOT NULL,
    "asset_snapshot" jsonb NOT NULL,
    "use_count" integer DEFAULT 1 NOT NULL,
    "first_used_at" timestamp with time zone DEFAULT now() NOT NULL,
    "last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "pk_work_agent_assets" PRIMARY KEY("work_id", "asset_ref")
);
--> statement-breakpoint
CREATE INDEX "idx_work_agent_assets_work_used" ON "work_agent_assets" ("work_id", "last_used_at");
--> statement-breakpoint
CREATE INDEX "idx_work_agent_assets_org_ref" ON "work_agent_assets" ("organization_id", "asset_ref");
--> statement-breakpoint
CREATE TABLE "agent_activities" (
    "activity_id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "user_id" text NOT NULL,
    "principal_type" text DEFAULT 'user' NOT NULL,
    "principal_id" text,
    "token_id" text,
    "connection_id" text,
    "tool_name" text NOT NULL,
    "action_id" text,
    "status" text NOT NULL,
    "input_summary" jsonb,
    "output_summary" jsonb,
    "error_code" text,
    "error_message" text,
    "duration_ms" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_agent_activities_org_created" ON "agent_activities" ("organization_id", "created_at");
--> statement-breakpoint
CREATE INDEX "idx_agent_activities_principal_created" ON "agent_activities" ("organization_id", "principal_type", "principal_id", "created_at");
--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "presentation" jsonb;
--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "verified_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "verified_by_user_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_findings_primary_per_work" ON "findings" ("organization_id", "work_id") WHERE "is_primary" = true;

