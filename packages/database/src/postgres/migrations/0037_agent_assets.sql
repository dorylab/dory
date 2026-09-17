CREATE TABLE "agent_principals" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "name" text NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "allowed_connection_ids" jsonb,
    "created_by_user_id" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_agent_principals_org_created" ON "agent_principals" ("organization_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_agent_principals_org_name" ON "agent_principals" ("organization_id", "name");
--> statement-breakpoint
ALTER TABLE "mcp_access_tokens" ADD COLUMN "principal_type" text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
ALTER TABLE "mcp_access_tokens" ADD COLUMN "principal_id" text;
--> statement-breakpoint
ALTER TABLE "mcp_access_tokens" ADD COLUMN "allowed_connection_ids" jsonb;
--> statement-breakpoint
ALTER TABLE "mcp_access_tokens" ADD COLUMN "expires_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "mcp_access_tokens" SET "principal_id" = "created_by_user_id" WHERE "principal_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "works" ADD COLUMN "principal_type" text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
ALTER TABLE "works" ADD COLUMN "principal_id" text;
--> statement-breakpoint
UPDATE "works" SET "principal_id" = "user_id" WHERE "principal_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "work_events" ADD COLUMN "principal_type" text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
ALTER TABLE "work_events" ADD COLUMN "principal_id" text;
--> statement-breakpoint
UPDATE "work_events" SET "principal_id" = "user_id" WHERE "principal_id" IS NULL;
--> statement-breakpoint
CREATE TABLE "work_agent_assets" (
    "work_id" text NOT NULL REFERENCES "works"("work_id") ON DELETE cascade,
    "organization_id" text NOT NULL,
    "user_id" text NOT NULL,
    "principal_type" text DEFAULT 'user' NOT NULL,
    "principal_id" text,
    "asset_kind" text NOT NULL,
    "asset_ref" text NOT NULL,
    "revision" text NOT NULL,
    "asset_snapshot" jsonb NOT NULL,
    "use_count" integer DEFAULT 1 NOT NULL,
    "first_used_at" timestamp with time zone DEFAULT now() NOT NULL,
    "last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "pk_work_agent_assets" PRIMARY KEY("work_id", "asset_ref")
);
--> statement-breakpoint
CREATE INDEX "idx_work_agent_assets_work_used" ON "work_agent_assets" ("work_id", "last_used_at");
--> statement-breakpoint
CREATE INDEX "idx_work_agent_assets_org_ref" ON "work_agent_assets" ("organization_id", "asset_ref");
--> statement-breakpoint
INSERT INTO "work_agent_assets" ("work_id", "organization_id", "user_id", "principal_type", "principal_id", "asset_kind", "asset_ref", "revision", "asset_snapshot", "use_count", "first_used_at", "last_used_at")
SELECT
    "work_id",
    "organization_id",
    "user_id",
    'user',
    "user_id",
    CASE "asset_type" WHEN 'definition' THEN 'knowledge_definition' WHEN 'source' THEN 'knowledge_source' ELSE 'verified_query' END,
    CASE "asset_type"
        WHEN 'definition' THEN 'dory://knowledge/' || "knowledge_model_id" || '/definitions/' || "asset_id"
        WHEN 'source' THEN 'dory://knowledge/' || "knowledge_model_id" || '/sources/' || "asset_id"
        ELSE 'dory://knowledge/' || "knowledge_model_id" || '/queries/' || "asset_id"
    END,
    'legacy',
    "asset_snapshot",
    "use_count",
    "first_used_at",
    "last_used_at"
FROM "work_knowledge_assets"
ON CONFLICT ("work_id", "asset_ref") DO NOTHING;
