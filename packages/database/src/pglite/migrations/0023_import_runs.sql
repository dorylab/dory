CREATE TABLE "import_run_events" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"connection_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"phase" text DEFAULT 'draft' NOT NULL,
	"source_name" text,
	"source_extension" text,
	"source_hash" text,
	"source_bytes" bigint,
	"source_object_path" text,
	"artifact_prefix" text,
	"source_arrow_path" text,
	"prepared_arrow_path" text,
	"parsing_options" jsonb,
	"profile" jsonb,
	"plan" jsonb,
	"progress" jsonb,
	"processed_rows" bigint DEFAULT 0 NOT NULL,
	"pending_rows" bigint DEFAULT 0 NOT NULL,
	"inserted_rows" bigint DEFAULT 0 NOT NULL,
	"batch_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"heartbeat_at" timestamp with time zone,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"artifacts_expire_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_import_run_events_sequence" ON "import_run_events" USING btree ("run_id","sequence");--> statement-breakpoint
CREATE INDEX "idx_import_run_events_org_run" ON "import_run_events" USING btree ("organization_id","run_id","sequence");--> statement-breakpoint
CREATE INDEX "idx_import_runs_org_created" ON "import_runs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_import_runs_status_heartbeat" ON "import_runs" USING btree ("status","heartbeat_at");--> statement-breakpoint
CREATE INDEX "idx_import_runs_artifacts_expire" ON "import_runs" USING btree ("artifacts_expire_at");