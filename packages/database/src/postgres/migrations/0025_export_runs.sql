CREATE TABLE "export_runs" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "created_by_user_id" text NOT NULL,
    "connection_id" text NOT NULL,
    "database_name" text NOT NULL,
    "table_name" text NOT NULL,
    "status" text DEFAULT 'queued' NOT NULL,
    "phase" text DEFAULT 'queued' NOT NULL,
    "plan" jsonb NOT NULL,
    "plan_hash" text NOT NULL,
    "progress" jsonb,
    "processed_rows" bigint DEFAULT 0 NOT NULL,
    "batch_count" integer DEFAULT 0 NOT NULL,
    "byte_size" bigint,
    "object_path" text,
    "manifest_path" text,
    "file_name" text,
    "content_type" text,
    "consistency" text,
    "error_code" text,
    "error_message" text,
    "heartbeat_at" timestamp with time zone,
    "cancel_requested" boolean DEFAULT false NOT NULL,
    "artifact_expires_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_export_runs_table_created" ON "export_runs" USING btree ("organization_id", "connection_id", "database_name", "table_name", "created_at");
--> statement-breakpoint
CREATE INDEX "idx_export_runs_status_heartbeat" ON "export_runs" USING btree ("status", "heartbeat_at");
--> statement-breakpoint
CREATE INDEX "idx_export_runs_artifact_expires" ON "export_runs" USING btree ("artifact_expires_at");
--> statement-breakpoint
CREATE TABLE "export_run_events" (
    "id" text PRIMARY KEY NOT NULL,
    "run_id" text NOT NULL,
    "organization_id" text NOT NULL,
    "sequence" integer NOT NULL,
    "type" text NOT NULL,
    "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_export_run_events_sequence" ON "export_run_events" USING btree ("run_id", "sequence");
--> statement-breakpoint
CREATE INDEX "idx_export_run_events_org_run" ON "export_run_events" USING btree ("organization_id", "run_id", "sequence");
