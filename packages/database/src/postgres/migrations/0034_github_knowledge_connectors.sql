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
