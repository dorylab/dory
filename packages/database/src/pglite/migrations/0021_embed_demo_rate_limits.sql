CREATE TABLE IF NOT EXISTS "embed_demo_rate_limits" (
    "day_key" text NOT NULL,
    "ip_hash" text NOT NULL,
    "sessions" integer DEFAULT 0 NOT NULL,
    "prompts" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "embed_demo_rate_limits_day_key_ip_hash_pk" PRIMARY KEY("day_key", "ip_hash")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_embed_demo_rate_limits_updated" ON "embed_demo_rate_limits" USING btree ("updated_at");
