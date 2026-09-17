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
UPDATE "works"
SET "status" = 'archived', "archived_at" = now(), "updated_at" = now(), "last_active_at" = now()
WHERE "archived_at" IS NULL
  AND "token_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "work_query_sessions" WHERE "work_query_sessions"."work_id" = "works"."work_id")
  AND NOT EXISTS (SELECT 1 FROM "tabs" WHERE "tabs"."work_id" = "works"."work_id")
  AND NOT EXISTS (SELECT 1 FROM "artifacts" WHERE "artifacts"."work_id" = "works"."work_id")
  AND EXISTS (SELECT 1 FROM "work_events" WHERE "work_events"."work_id" = "works"."work_id")
  AND NOT EXISTS (
      SELECT 1 FROM "work_events"
      WHERE "work_events"."work_id" = "works"."work_id"
        AND "work_events"."tool_name" IN ('dory_run_readonly_sql', 'dory_workspace_tabs', 'dory_saved_queries')
  );
