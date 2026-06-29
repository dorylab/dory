CREATE TABLE "local_ai_bridges" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "user_id" text NOT NULL,
    "mcp_token_id" text NOT NULL,
    "provider" text NOT NULL,
    "name" text NOT NULL,
    "capabilities" jsonb,
    "last_seen_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone NOT NULL
);--> statement-breakpoint

CREATE INDEX "idx_local_ai_bridges_org_provider_seen" ON "local_ai_bridges" USING btree ("organization_id","provider","last_seen_at");--> statement-breakpoint
CREATE INDEX "idx_local_ai_bridges_token" ON "local_ai_bridges" USING btree ("mcp_token_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_local_ai_bridges_token_provider_name" ON "local_ai_bridges" USING btree ("mcp_token_id","provider","name") WHERE "local_ai_bridges"."revoked_at" IS NULL;--> statement-breakpoint

CREATE TABLE "local_ai_jobs" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "bridge_id" text NOT NULL,
    "provider" text NOT NULL,
    "model" text NOT NULL,
    "status" text DEFAULT 'pending' NOT NULL,
    "prompt" text NOT NULL,
    "result_text" text,
    "stdout" text,
    "stderr" text,
    "error_message" text,
    "attempts" integer DEFAULT 0 NOT NULL,
    "claimed_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone NOT NULL
);--> statement-breakpoint

CREATE INDEX "idx_local_ai_jobs_bridge_status_created" ON "local_ai_jobs" USING btree ("bridge_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_local_ai_jobs_org_created" ON "local_ai_jobs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_local_ai_jobs_expires" ON "local_ai_jobs" USING btree ("expires_at");
