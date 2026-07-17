ALTER TABLE "query_runs" ADD COLUMN IF NOT EXISTS "session_id" text;
--> statement-breakpoint
ALTER TABLE "query_runs" ADD COLUMN IF NOT EXISTS "set_index" integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_query_runs_session_set" ON "query_runs" USING btree ("organization_id","session_id","set_index");
--> statement-breakpoint
ALTER TABLE "result_sets" ADD COLUMN IF NOT EXISTS "source_connection_type" text;
--> statement-breakpoint
ALTER TABLE "result_sets" ADD COLUMN IF NOT EXISTS "source_database_name" text;
--> statement-breakpoint
ALTER TABLE "result_sets" ADD COLUMN IF NOT EXISTS "session_id" text;
--> statement-breakpoint
ALTER TABLE "result_sets" ADD COLUMN IF NOT EXISTS "set_index" integer;
--> statement-breakpoint
ALTER TABLE "result_sets" ADD COLUMN IF NOT EXISTS "view_state" jsonb;
--> statement-breakpoint
ALTER TABLE "result_sets" ALTER COLUMN "byte_size" SET DATA TYPE bigint;
--> statement-breakpoint
ALTER TABLE "result_sets" ADD COLUMN IF NOT EXISTS "storage_limit_applied" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_result_sets_session_set" ON "result_sets" USING btree ("organization_id","session_id","set_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_result_sets_expires_at" ON "result_sets" USING btree ("expires_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "result_set_exports" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "result_set_id" text,
    "object_path" text NOT NULL,
    "format" text NOT NULL,
    "file_name" text NOT NULL,
    "byte_size" bigint NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_result_set_exports_org_created" ON "result_set_exports" USING btree ("organization_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_result_set_exports_org_expires" ON "result_set_exports" USING btree ("organization_id", "expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_result_set_exports_result_set" ON "result_set_exports" USING btree ("result_set_id");
