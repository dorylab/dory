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
CREATE INDEX "idx_work_workspace_snapshots_work_created" ON "work_workspace_snapshots" USING btree ("organization_id","work_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_work_workspace_snapshots_investigation_created" ON "work_workspace_snapshots" USING btree ("organization_id","investigation_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_work_workspace_snapshots_workspace_created" ON "work_workspace_snapshots" USING btree ("organization_id","workspace_id","created_at");
