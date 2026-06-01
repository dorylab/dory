CREATE TABLE "action_audit" (
    "id" text PRIMARY KEY NOT NULL,
    "action_run_id" text NOT NULL,
    "request_id" text,
    "action_id" text NOT NULL,
    "action_version" integer NOT NULL,
    "status" text NOT NULL,
    "risk" text NOT NULL,
    "effects" jsonb,
    "organization_id" text NOT NULL,
    "user_id" text NOT NULL,
    "actor_type" text NOT NULL,
    "actor_id" text,
    "projection" text NOT NULL,
    "source" text,
    "resource" jsonb,
    "input_hash" text,
    "redacted_input_summary" jsonb,
    "redacted_output_summary" jsonb,
    "error_code" text,
    "error_message" text,
    "duration_ms" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_action_audit_org_created" ON "action_audit" USING btree ("organization_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_action_audit_run" ON "action_audit" USING btree ("action_run_id");
--> statement-breakpoint
CREATE INDEX "idx_action_audit_action_created" ON "action_audit" USING btree ("action_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_action_audit_actor_created" ON "action_audit" USING btree ("actor_type","created_at");
