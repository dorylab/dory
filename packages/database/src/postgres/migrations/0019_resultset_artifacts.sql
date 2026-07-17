CREATE TABLE IF NOT EXISTS "query_runs" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "connection_id" text,
    "workspace_id" text,
    "tab_id" text,
    "work_id" text,
    "agent_run_id" text,
    "actor_type" text NOT NULL,
    "actor_id" text,
    "sql" text NOT NULL,
    "status" text DEFAULT 'running' NOT NULL,
    "duration_ms" integer,
    "error_message" text,
    "result_set_id" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_query_runs_org_created" ON "query_runs" USING btree ("organization_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_query_runs_connection_created" ON "query_runs" USING btree ("organization_id","connection_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_query_runs_tab_created" ON "query_runs" USING btree ("tab_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_query_runs_work_created" ON "query_runs" USING btree ("work_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_query_runs_agent_created" ON "query_runs" USING btree ("agent_run_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_query_runs_result_set" ON "query_runs" USING btree ("result_set_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "result_sets" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "connection_id" text,
    "workspace_id" text,
    "tab_id" text,
    "work_id" text,
    "agent_run_id" text,
    "source_query_run_id" text,
    "source_type" text NOT NULL,
    "kind" text NOT NULL,
    "status" text NOT NULL,
    "row_count" integer,
    "preview_row_count" integer DEFAULT 0 NOT NULL,
    "limited" boolean DEFAULT false NOT NULL,
    "limit" integer,
    "schema_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "sql" text,
    "operation" text,
    "error_message" text,
    "artifact_ref_json" jsonb NOT NULL,
    "data_availability" text DEFAULT 'none' NOT NULL,
    "parent_result_set_id" text,
    "previous_result_set_id" text,
    "refresh_of_result_set_id" text,
    "derived_from_result_set_id" text,
    "created_by_actor_type" text NOT NULL,
    "created_by_actor_id" text,
    "content_hash" text,
    "byte_size" integer,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_result_sets_org_created" ON "result_sets" USING btree ("organization_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_result_sets_connection_created" ON "result_sets" USING btree ("organization_id","connection_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_result_sets_tab_created" ON "result_sets" USING btree ("tab_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_result_sets_work_created" ON "result_sets" USING btree ("work_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_result_sets_agent_created" ON "result_sets" USING btree ("agent_run_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_result_sets_source_query_run" ON "result_sets" USING btree ("source_query_run_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_run_result_sets" (
    "id" text PRIMARY KEY NOT NULL,
    "agent_run_id" text NOT NULL,
    "result_set_id" text NOT NULL,
    "query_run_id" text,
    "role" text DEFAULT 'generated' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_run_result_sets_run" ON "agent_run_result_sets" USING btree ("agent_run_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_run_result_sets_result_set" ON "agent_run_result_sets" USING btree ("result_set_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_run_result_sets_query_run" ON "agent_run_result_sets" USING btree ("query_run_id");
--> statement-breakpoint
ALTER TABLE "tabs" ADD COLUMN IF NOT EXISTS "current_result_set_id" text;
--> statement-breakpoint
ALTER TABLE "work_query_result_sets" ADD COLUMN IF NOT EXISTS "result_set_id" text;
--> statement-breakpoint
ALTER TABLE "work_query_result_sets" ADD COLUMN IF NOT EXISTS "artifact_ref_json" jsonb;
--> statement-breakpoint
DROP TABLE IF EXISTS "work_query_result_pages";
