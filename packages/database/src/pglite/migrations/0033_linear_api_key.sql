CREATE TABLE "knowledge_linear_credentials" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "workspace_id" text NOT NULL,
    "workspace_name" text NOT NULL,
    "api_key_encrypted" text NOT NULL,
    "status" text DEFAULT 'active' NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_knowledge_linear_credentials_org_workspace" ON "knowledge_linear_credentials" ("organization_id", "workspace_id");
--> statement-breakpoint
ALTER TABLE "knowledge_connectors" ADD COLUMN "credential_id" text REFERENCES "knowledge_linear_credentials"("id");
--> statement-breakpoint
UPDATE "knowledge_connector_sync_jobs" SET "status" = 'failed', "lease_token" = NULL, "error" = 'Update the Linear API Key to resume synchronization.', "updated_at" = now()
WHERE "connector_id" IN (SELECT "id" FROM "knowledge_connectors" WHERE "provider" = 'linear') AND "status" IN ('queued', 'running');
--> statement-breakpoint
UPDATE "knowledge_connectors" SET "status" = 'disabled', "last_error" = 'Update the Linear API Key to resume synchronization.', "config_revision" = "config_revision" + 1, "updated_at" = now() WHERE "provider" = 'linear';
--> statement-breakpoint
ALTER TABLE "knowledge_connectors" DROP COLUMN "authorization_id";
--> statement-breakpoint
DROP TABLE "knowledge_linear_oauth_states";
--> statement-breakpoint
DROP TABLE "knowledge_linear_deliveries";
--> statement-breakpoint
DROP TABLE "knowledge_linear_authorizations";
