ALTER TABLE "query_runs" ADD COLUMN IF NOT EXISTS "session_id" text;
--> statement-breakpoint
ALTER TABLE "query_runs" ADD COLUMN IF NOT EXISTS "set_index" integer;
--> statement-breakpoint
ALTER TABLE "result_sets" ADD COLUMN IF NOT EXISTS "session_id" text;
--> statement-breakpoint
ALTER TABLE "result_sets" ADD COLUMN IF NOT EXISTS "set_index" integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_query_runs_session_set" ON "query_runs" USING btree ("organization_id","session_id","set_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_result_sets_session_set" ON "result_sets" USING btree ("organization_id","session_id","set_index");
