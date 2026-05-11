CREATE TABLE "mcp_access_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by_user_id" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_mcp_access_tokens_hash" ON "mcp_access_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_mcp_access_tokens_organization_created" ON "mcp_access_tokens" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_mcp_access_tokens_organization_active" ON "mcp_access_tokens" USING btree ("organization_id","enabled","revoked_at") WHERE "mcp_access_tokens"."revoked_at" IS NULL;