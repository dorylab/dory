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
CREATE INDEX "idx_work_run_events_run_created_at" ON "work_run_events" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_work_run_events_work_created_at" ON "work_run_events" USING btree ("work_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_work_run_events_organization_work" ON "work_run_events" USING btree ("organization_id","work_id");--> statement-breakpoint
CREATE INDEX "idx_work_run_events_type" ON "work_run_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_work_runs_work_started_at" ON "work_runs" USING btree ("work_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_work_runs_organization_work" ON "work_runs" USING btree ("organization_id","work_id");--> statement-breakpoint
CREATE INDEX "idx_work_runs_status" ON "work_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_work_runs_one_running_per_work" ON "work_runs" USING btree ("work_id") WHERE "work_runs"."status" = 'running';