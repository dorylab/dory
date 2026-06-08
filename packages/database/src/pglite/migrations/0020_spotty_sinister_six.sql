ALTER TABLE "work_investigation_findings" ALTER COLUMN "order_index" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "tabs" ADD COLUMN "workspace_scope_type" text DEFAULT 'connection' NOT NULL;--> statement-breakpoint
ALTER TABLE "tabs" ADD COLUMN "workspace_scope_work_id" text;--> statement-breakpoint
ALTER TABLE "tabs" ADD COLUMN "workspace_scope_investigation_id" text;--> statement-breakpoint
CREATE INDEX "idx_tabs_workspace_scope" ON "tabs" USING btree ("user_id","connection_id","workspace_scope_type","workspace_scope_work_id","workspace_scope_investigation_id");