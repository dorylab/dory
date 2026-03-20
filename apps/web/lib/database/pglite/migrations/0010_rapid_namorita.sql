DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'team_id'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'organization_id'
    ) THEN
        EXECUTE 'ALTER TABLE "chat_messages" RENAME COLUMN "team_id" TO "organization_id"';
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'chat_session_state' AND column_name = 'team_id'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'chat_session_state' AND column_name = 'organization_id'
    ) THEN
        EXECUTE 'ALTER TABLE "chat_session_state" RENAME COLUMN "team_id" TO "organization_id"';
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'chat_sessions' AND column_name = 'team_id'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'chat_sessions' AND column_name = 'organization_id'
    ) THEN
        EXECUTE 'ALTER TABLE "chat_sessions" RENAME COLUMN "team_id" TO "organization_id"';
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'query_audit' AND column_name = 'team_id'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'query_audit' AND column_name = 'organization_id'
    ) THEN
        EXECUTE 'ALTER TABLE "query_audit" RENAME COLUMN "team_id" TO "organization_id"';
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'organization_members' AND column_name = 'team_id'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'organization_members' AND column_name = 'organization_id'
    ) THEN
        EXECUTE 'ALTER TABLE "organization_members" RENAME COLUMN "team_id" TO "organization_id"';
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'connection_identities' AND column_name = 'team_id'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'connection_identities' AND column_name = 'organization_id'
    ) THEN
        EXECUTE 'ALTER TABLE "connection_identities" RENAME COLUMN "team_id" TO "organization_id"';
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'connections' AND column_name = 'team_id'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'connections' AND column_name = 'organization_id'
    ) THEN
        EXECUTE 'ALTER TABLE "connections" RENAME COLUMN "team_id" TO "organization_id"';
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ai_schema_cache' AND column_name = 'team_id'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ai_schema_cache' AND column_name = 'organization_id'
    ) THEN
        EXECUTE 'ALTER TABLE "ai_schema_cache" RENAME COLUMN "team_id" TO "organization_id"';
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'saved_queries' AND column_name = 'team_id'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'saved_queries' AND column_name = 'organization_id'
    ) THEN
        EXECUTE 'ALTER TABLE "saved_queries" RENAME COLUMN "team_id" TO "organization_id"';
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'saved_query_folders' AND column_name = 'team_id'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'saved_query_folders' AND column_name = 'organization_id'
    ) THEN
        EXECUTE 'ALTER TABLE "saved_query_folders" RENAME COLUMN "team_id" TO "organization_id"';
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ai_usage_events' AND column_name = 'team_id'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ai_usage_events' AND column_name = 'organization_id'
    ) THEN
        EXECUTE 'ALTER TABLE "ai_usage_events" RENAME COLUMN "team_id" TO "organization_id"';
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ai_usage_traces' AND column_name = 'team_id'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ai_usage_traces' AND column_name = 'organization_id'
    ) THEN
        EXECUTE 'ALTER TABLE "ai_usage_traces" RENAME COLUMN "team_id" TO "organization_id"';
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sync_operations' AND column_name = 'team_id'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sync_operations' AND column_name = 'organization_id'
    ) THEN
        EXECUTE 'ALTER TABLE "sync_operations" RENAME COLUMN "team_id" TO "organization_id"';
    END IF;
END $$;--> statement-breakpoint
ALTER TABLE "chat_sessions" DROP CONSTRAINT IF EXISTS "uq_chat_sessions_id_team";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_chat_messages_team_conn_time";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_chat_state_team_conn";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_chat_state_team_tab";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_chat_state_team_updated";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_chat_sessions_team_user_type";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_chat_sessions_team_conn";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_chat_sessions_team_db";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_team_created";--> statement-breakpoint
DROP INDEX IF EXISTS "organization_members_team_id_user_id_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_organization_members_team";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_conn_identity_team_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_conn_identity_team_cloud_id";--> statement-breakpoint
DROP INDEX IF EXISTS "uniq_connections_team_name";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_connections_team_id_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_connections_team_cloud_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_connections_team_env";--> statement-breakpoint
DROP INDEX IF EXISTS "uniq_ai_cache_team_conn_catalog_feature_schema_model_prompt";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ai_cache_team_conn";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_saved_queries_team_user";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_saved_query_folders_team_user";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ai_usage_events_team_created";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ai_usage_events_team_created_total";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ai_usage_events_team_user_created";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ai_usage_events_team_feature_created";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ai_usage_traces_team_created";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_ai_usage_traces_team_user_created";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_sync_operations_team_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_chat_messages_session_time";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_chat_messages_session_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_chat_sessions_list";--> statement-breakpoint
DROP INDEX IF EXISTS "uidx_chat_sessions_copilot_tab";--> statement-breakpoint
ALTER TABLE "organization_members" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "organization_members" ALTER COLUMN "status" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_members" ALTER COLUMN "joined_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "organization_members" ALTER COLUMN "joined_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "metadata" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_messages_organization_conn_time" ON "chat_messages" USING btree ("organization_id","connection_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_state_organization_conn" ON "chat_session_state" USING btree ("organization_id","connection_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_state_organization_tab" ON "chat_session_state" USING btree ("organization_id","active_tab_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_state_organization_updated" ON "chat_session_state" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_sessions_organization_user_type" ON "chat_sessions" USING btree ("organization_id","user_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_sessions_organization_conn" ON "chat_sessions" USING btree ("organization_id","connection_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_sessions_organization_db" ON "chat_sessions" USING btree ("organization_id","active_database");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_organization_created" ON "query_audit" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_members_organization_id_user_id_unique" ON "organization_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_organization_members_organization" ON "organization_members" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conn_identity_organization_id" ON "connection_identities" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conn_identity_organization_cloud_id" ON "connection_identities" USING btree ("organization_id","cloud_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_connections_organization_name" ON "connections" USING btree ("organization_id","name") WHERE "connections"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_connections_organization_id_status" ON "connections" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_connections_organization_cloud_id" ON "connections" USING btree ("organization_id","cloud_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_connections_organization_env" ON "connections" USING btree ("organization_id","environment");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_ai_cache_organization_conn_catalog_feature_schema_model_prompt" ON "ai_schema_cache" USING btree ("organization_id","connection_id","catalog","feature","schema_hash","model","prompt_version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_cache_organization_conn" ON "ai_schema_cache" USING btree ("organization_id","connection_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_saved_queries_organization_user" ON "saved_queries" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_saved_query_folders_organization_user" ON "saved_query_folders" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_usage_events_organization_created" ON "ai_usage_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_usage_events_organization_created_total" ON "ai_usage_events" USING btree ("organization_id","created_at","total_tokens");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_usage_events_organization_user_created" ON "ai_usage_events" USING btree ("organization_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_usage_events_organization_feature_created" ON "ai_usage_events" USING btree ("organization_id","feature","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_usage_traces_organization_created" ON "ai_usage_traces" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_usage_traces_organization_user_created" ON "ai_usage_traces" USING btree ("organization_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_operations_organization_status" ON "sync_operations" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_messages_session_time" ON "chat_messages" USING btree ("organization_id","session_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_messages_session_id" ON "chat_messages" USING btree ("organization_id","session_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_sessions_list" ON "chat_sessions" USING btree ("organization_id","user_id","archived_at","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_chat_sessions_copilot_tab" ON "chat_sessions" USING btree ("organization_id","user_id","tab_id") WHERE "chat_sessions"."type" = 'copilot';--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_chat_sessions_id_organization'
    ) THEN
        EXECUTE 'ALTER TABLE "chat_sessions" ADD CONSTRAINT "uq_chat_sessions_id_organization" UNIQUE("id","organization_id")';
    END IF;
END $$;
