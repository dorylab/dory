CREATE TABLE "organization_ai_providers" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "provider" text NOT NULL,
    "model" text NOT NULL,
    "base_url" text,
    "api_key_encrypted" text,
    "key_hint" text,
    "enabled" boolean DEFAULT true NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_by_user_id" text,
    "updated_by_user_id" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_organization_ai_providers_org" ON "organization_ai_providers" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "idx_organization_ai_providers_org_enabled" ON "organization_ai_providers" USING btree ("organization_id","enabled");
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_organization_ai_provider_default" ON "organization_ai_providers" USING btree ("organization_id") WHERE "organization_ai_providers"."is_default" = true;
