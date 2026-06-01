CREATE TABLE "mcp_authorization_requests" (
    "id" text PRIMARY KEY NOT NULL,
    "client_name" text NOT NULL,
    "verifier_hash" text NOT NULL,
    "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "status" text DEFAULT 'pending' NOT NULL,
    "organization_id" text,
    "user_id" text,
    "mcp_token_id" text,
    "approved_at" timestamp with time zone,
    "denied_at" timestamp with time zone,
    "consumed_at" timestamp with time zone,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_mcp_authorization_requests_status_expires" ON "mcp_authorization_requests" USING btree ("status","expires_at");
--> statement-breakpoint
CREATE INDEX "idx_mcp_authorization_requests_org_user_created" ON "mcp_authorization_requests" USING btree ("organization_id","user_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_mcp_authorization_requests_token" ON "mcp_authorization_requests" USING btree ("mcp_token_id");
