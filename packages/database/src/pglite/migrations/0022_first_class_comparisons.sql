CREATE TABLE "comparisons" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "created_by_user_id" text NOT NULL,
    "name" text NOT NULL,
    "kind" text DEFAULT 'schema' NOT NULL,
    "source_endpoint" jsonb NOT NULL,
    "target_endpoint" jsonb NOT NULL,
    "schema_filter" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "object_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "dialect_family" text NOT NULL,
    "configuration_version" integer DEFAULT 1 NOT NULL,
    "latest_run_id" text,
    "latest_successful_run_id" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comparison_runs" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "comparison_id" text NOT NULL,
    "created_by_user_id" text NOT NULL,
    "actor_type" text DEFAULT 'user' NOT NULL,
    "work_id" text,
    "status" text DEFAULT 'running' NOT NULL,
    "configuration_snapshot" jsonb NOT NULL,
    "coverage" jsonb,
    "summary" jsonb,
    "source_snapshot_hash" text,
    "target_snapshot_hash" text,
    "artifact_ref" jsonb,
    "result_set_id" text,
    "ai_review_status" text DEFAULT 'pending' NOT NULL,
    "ai_review" jsonb,
    "ai_review_error" text,
    "failure_code" text,
    "failure_message" text,
    "started_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "result_sets" ADD COLUMN "comparison_run_id" text;
--> statement-breakpoint
DELETE FROM "result_set_exports"
WHERE "result_set_id" IN (
    SELECT "id"
    FROM "result_sets"
    WHERE "comparison_id" IS NOT NULL
);
--> statement-breakpoint
DELETE FROM "agent_run_result_sets"
WHERE "result_set_id" IN (
    SELECT "id"
    FROM "result_sets"
    WHERE "comparison_id" IS NOT NULL
);
--> statement-breakpoint
UPDATE "query_runs"
SET "result_set_id" = NULL
WHERE "result_set_id" IN (
    SELECT "id"
    FROM "result_sets"
    WHERE "comparison_id" IS NOT NULL
);
--> statement-breakpoint
UPDATE "tabs"
SET "current_result_set_id" = NULL
WHERE "current_result_set_id" IN (
    SELECT "id"
    FROM "result_sets"
    WHERE "comparison_id" IS NOT NULL
);
--> statement-breakpoint
UPDATE "work_query_result_sets"
SET "result_set_id" = NULL,
    "artifact_ref_json" = NULL
WHERE "result_set_id" IN (
    SELECT "id"
    FROM "result_sets"
    WHERE "comparison_id" IS NOT NULL
);
--> statement-breakpoint
DELETE FROM "result_sets"
WHERE "comparison_id" IS NOT NULL;
--> statement-breakpoint
DROP TABLE "comparison_jobs";
--> statement-breakpoint
CREATE INDEX "idx_comparisons_org_updated" ON "comparisons" USING btree ("organization_id","updated_at");
--> statement-breakpoint
CREATE INDEX "idx_comparison_runs_comparison_started" ON "comparison_runs" USING btree ("comparison_id","started_at");
--> statement-breakpoint
CREATE INDEX "idx_comparison_runs_org_started" ON "comparison_runs" USING btree ("organization_id","started_at");
--> statement-breakpoint
CREATE INDEX "idx_comparison_runs_work_started" ON "comparison_runs" USING btree ("work_id","started_at");
--> statement-breakpoint
CREATE INDEX "idx_comparison_runs_status_updated" ON "comparison_runs" USING btree ("status","updated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_comparison_runs_active" ON "comparison_runs" USING btree ("comparison_id") WHERE "comparison_runs"."status" = 'running';
--> statement-breakpoint
CREATE INDEX "idx_result_sets_comparison_run" ON "result_sets" USING btree ("comparison_run_id");
