CREATE TABLE "comparison_jobs" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "created_by_user_id" text NOT NULL,
    "work_id" text,
    "kind" text DEFAULT 'schema' NOT NULL,
    "status" text DEFAULT 'running' NOT NULL,
    "current_endpoint" jsonb NOT NULL,
    "desired_endpoint" jsonb NOT NULL,
    "dialect_family" text NOT NULL,
    "coverage" jsonb,
    "summary" jsonb,
    "current_snapshot_hash" text,
    "desired_snapshot_hash" text,
    "snapshot_artifact_ref" jsonb,
    "result_set_id" text,
    "ai_review_status" text DEFAULT 'pending' NOT NULL,
    "ai_review" jsonb,
    "ai_review_error" text,
    "previous_comparison_id" text,
    "failure_code" text,
    "failure_message" text,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "result_sets" ADD COLUMN "comparison_id" text;
--> statement-breakpoint
CREATE INDEX "idx_result_sets_comparison" ON "result_sets" USING btree ("comparison_id");
--> statement-breakpoint
CREATE INDEX "idx_comparison_jobs_org_created" ON "comparison_jobs" USING btree ("organization_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_comparison_jobs_work_created" ON "comparison_jobs" USING btree ("work_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_comparison_jobs_status_updated" ON "comparison_jobs" USING btree ("status","updated_at");
--> statement-breakpoint
CREATE INDEX "idx_comparison_jobs_expires_at" ON "comparison_jobs" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX "idx_comparison_jobs_previous" ON "comparison_jobs" USING btree ("previous_comparison_id");
