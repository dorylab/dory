ALTER TABLE "knowledge_sources" ADD COLUMN "system_role" text;
--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_system_role_check" CHECK (
    "system_role" IS NULL OR ("system_role" = 'analysis_rules' AND "file_name" = 'RULES.md' AND "format" = 'markdown' AND "folder_id" IS NULL AND "connection_id" IS NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_knowledge_sources_analysis_rules" ON "knowledge_sources" ("knowledge_model_id") WHERE "system_role" = 'analysis_rules';
