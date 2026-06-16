CREATE TABLE "work_investigation_findings" (
	"id" text PRIMARY KEY NOT NULL,
	"work_id" text NOT NULL,
	"investigation_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"content" text NOT NULL,
	"why_it_matters" text,
	"source_tab_id" text,
	"source_run_event_id" text,
	"created_by" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_investigation_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"work_id" text NOT NULL,
	"investigation_id" text NOT NULL,
	"version" integer NOT NULL,
	"instruction" text,
	"title" text NOT NULL,
	"findings_snapshot" jsonb NOT NULL,
	"asset_summary" jsonb NOT NULL,
	"run_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_investigations" (
	"id" text PRIMARY KEY NOT NULL,
	"work_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"audit_status" text DEFAULT 'draft' NOT NULL,
	"current_revision_id" text,
	"linked_tab_id" text,
	"last_query_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"audit_status_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_run_events" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"work_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"type" text NOT NULL,
	"role" text NOT NULL,
	"content" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"work_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"previous_work_status" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "work_workspace_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"work_id" text NOT NULL,
	"investigation_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"previous_agent_step_id" text,
	"intent" text NOT NULL,
	"human_edits" jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "works" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"title" text DEFAULT 'Untitled Work' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"goal" text NOT NULL,
	"work_type" text DEFAULT 'investigation' NOT NULL,
	"scope" jsonb,
	"initial_context" text,
	"conclusion" text,
	"conclusion_metadata" jsonb,
	"conclusion_status" text DEFAULT 'missing' NOT NULL,
	"conclusion_updated_at" timestamp with time zone,
	"connection_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tabs" ADD COLUMN "workspace_scope_type" text DEFAULT 'connection' NOT NULL;--> statement-breakpoint
ALTER TABLE "tabs" ADD COLUMN "workspace_scope_work_id" text;--> statement-breakpoint
ALTER TABLE "tabs" ADD COLUMN "workspace_scope_investigation_id" text;--> statement-breakpoint
CREATE INDEX "idx_work_investigation_findings_work" ON "work_investigation_findings" USING btree ("organization_id","work_id");--> statement-breakpoint
CREATE INDEX "idx_work_investigation_findings_investigation" ON "work_investigation_findings" USING btree ("organization_id","investigation_id");--> statement-breakpoint
CREATE INDEX "idx_work_investigation_findings_source_tab" ON "work_investigation_findings" USING btree ("source_tab_id");--> statement-breakpoint
CREATE INDEX "idx_work_investigation_findings_source_event" ON "work_investigation_findings" USING btree ("source_run_event_id");--> statement-breakpoint
CREATE INDEX "idx_work_investigation_revisions_work" ON "work_investigation_revisions" USING btree ("organization_id","work_id");--> statement-breakpoint
CREATE INDEX "idx_work_investigation_revisions_investigation" ON "work_investigation_revisions" USING btree ("organization_id","investigation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_work_investigation_revisions_version" ON "work_investigation_revisions" USING btree ("investigation_id","version");--> statement-breakpoint
CREATE INDEX "idx_work_investigations_work_id" ON "work_investigations" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "idx_work_investigations_organization_work" ON "work_investigations" USING btree ("organization_id","work_id");--> statement-breakpoint
CREATE INDEX "idx_work_investigations_connection_id" ON "work_investigations" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "idx_work_run_events_run_created_at" ON "work_run_events" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_work_run_events_work_created_at" ON "work_run_events" USING btree ("work_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_work_run_events_organization_work" ON "work_run_events" USING btree ("organization_id","work_id");--> statement-breakpoint
CREATE INDEX "idx_work_run_events_type" ON "work_run_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_work_runs_work_started_at" ON "work_runs" USING btree ("work_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_work_runs_organization_work" ON "work_runs" USING btree ("organization_id","work_id");--> statement-breakpoint
CREATE INDEX "idx_work_runs_status" ON "work_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_work_runs_one_running_per_work" ON "work_runs" USING btree ("work_id") WHERE "work_runs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "idx_work_workspace_snapshots_work_created" ON "work_workspace_snapshots" USING btree ("organization_id","work_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_work_workspace_snapshots_investigation_created" ON "work_workspace_snapshots" USING btree ("organization_id","investigation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_work_workspace_snapshots_workspace_created" ON "work_workspace_snapshots" USING btree ("organization_id","workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_works_organization_updated_at" ON "works" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_works_connection_id" ON "works" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "idx_works_created_by_user_id" ON "works" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_tabs_workspace_scope" ON "tabs" USING btree ("user_id","connection_id","workspace_scope_type","workspace_scope_work_id","workspace_scope_investigation_id");