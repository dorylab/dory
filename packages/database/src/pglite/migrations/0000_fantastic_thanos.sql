CREATE TABLE "tabs" (
	"tab_id" text PRIMARY KEY NOT NULL,
	"tab_type" text DEFAULT 'sql' NOT NULL,
	"tab_name" text DEFAULT 'New Query' NOT NULL,
	"user_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"database_name" text,
	"table_name" text,
	"active_sub_tab" text DEFAULT 'data' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"state" text,
	"result_meta" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jwks" (
	"id" text PRIMARY KEY NOT NULL,
	"alg" text,
	"crv" text,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text,
	"connection_id" text,
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_session_state" (
	"session_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"connection_id" text,
	"active_tab_id" text,
	"active_database" text,
	"active_schema" text,
	"editor_context" jsonb,
	"last_run_summary" jsonb,
	"stable_context" jsonb,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"type" text DEFAULT 'copilot' NOT NULL,
	"tab_id" text,
	"connection_id" text,
	"active_database" text,
	"active_schema" text,
	"title" text,
	"settings" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"archived_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	CONSTRAINT "uq_chat_sessions_id_organization" UNIQUE("id","organization_id"),
	CONSTRAINT "ck_chat_sessions_type_tab" CHECK ((("chat_sessions"."type" = 'copilot' AND "chat_sessions"."tab_id" IS NOT NULL) OR ("chat_sessions"."type" <> 'copilot' AND "chat_sessions"."tab_id" IS NULL)))
);
--> statement-breakpoint
CREATE TABLE "query_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"tab_id" text,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"connection_id" text,
	"connection_name" text,
	"database_name" text,
	"query_id" text,
	"sql_text" text NOT NULL,
	"status" text NOT NULL,
	"error_message" text,
	"duration_ms" integer,
	"rows_read" integer,
	"bytes_read" integer,
	"rows_written" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"extra_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"joined_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"slug" text,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connection_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"created_by_user_id" text,
	"connection_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"source" text DEFAULT 'local' NOT NULL,
	"cloud_id" text,
	"sync_status" text DEFAULT 'local_only' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"remote_updated_at" timestamp with time zone,
	"sync_error" text,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"role" text,
	"options" text DEFAULT '{}' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"database" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "connection_identity_secrets" (
	"identity_id" text PRIMARY KEY NOT NULL,
	"password_encrypted" text,
	"vault_ref" text,
	"secret_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connection_ssh" (
	"connection_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"host" text,
	"port" integer,
	"username" text,
	"auth_method" text,
	"password_encrypted" text,
	"private_key_encrypted" text,
	"passphrase_encrypted" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "chk_connection_ssh_port" CHECK ("connection_ssh"."port" IS NULL OR ("connection_ssh"."port" BETWEEN 1 AND 65535))
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" text PRIMARY KEY NOT NULL,
	"created_by_user_id" text,
	"organization_id" text NOT NULL,
	"source" text DEFAULT 'local' NOT NULL,
	"cloud_id" text,
	"sync_status" text DEFAULT 'local_only' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"remote_updated_at" timestamp with time zone,
	"sync_error" text,
	"type" text NOT NULL,
	"engine" text NOT NULL,
	"name" text DEFAULT 'Untitled connection' NOT NULL,
	"description" text,
	"host" text NOT NULL,
	"port" integer NOT NULL,
	"http_port" integer,
	"database" text,
	"options" text DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"config_version" integer DEFAULT 1 NOT NULL,
	"validation_errors" text DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"last_check_status" text DEFAULT 'unknown' NOT NULL,
	"last_check_at" timestamp with time zone,
	"last_check_latency_ms" integer,
	"last_check_error" text,
	"environment" text DEFAULT '',
	"tags" text DEFAULT '' NOT NULL,
	CONSTRAINT "chk_connections_port" CHECK ("connections"."port" IS NULL OR ("connections"."port" BETWEEN 1 AND 65535)),
	CONSTRAINT "chk_connections_http_port" CHECK ("connections"."http_port" IS NULL OR ("connections"."http_port" BETWEEN 1 AND 65535))
);
--> statement-breakpoint
CREATE TABLE "ai_schema_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"catalog" text DEFAULT 'default' NOT NULL,
	"database_name" text,
	"table_name" text,
	"feature" text NOT NULL,
	"db_type" text,
	"schema_hash" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_queries" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"sql_text" text NOT NULL,
	"connection_id" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"folder_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"work_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "saved_query_folders" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"organization_id" text,
	"user_id" text,
	"feature" text,
	"model" text,
	"prompt_version" integer,
	"algo_version" integer,
	"status" text DEFAULT 'ok' NOT NULL,
	"error_code" text,
	"error_message" text,
	"gateway" text,
	"provider" text,
	"cost_micros" integer,
	"trace_id" text,
	"span_id" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"reasoning_tokens" integer,
	"cached_input_tokens" integer,
	"total_tokens" integer,
	"usage_json" jsonb,
	"latency_ms" integer,
	"from_cache" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_ai_usage_events_status" CHECK ("ai_usage_events"."status" in ('ok', 'error', 'aborted'))
);
--> statement-breakpoint
CREATE TABLE "ai_usage_traces" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"organization_id" text,
	"user_id" text,
	"feature" text,
	"model" text,
	"input_text" text,
	"output_text" text,
	"input_json" jsonb,
	"output_json" jsonb,
	"redacted" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '180 days' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" text DEFAULT 'connection' NOT NULL,
	"entity_id" text NOT NULL,
	"operation" text NOT NULL,
	"payload" text DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"synced_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_invitation_organization_id" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_invitation_email" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_invitation_status" ON "invitation" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_chat_messages_session_time" ON "chat_messages" USING btree ("organization_id","session_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_chat_messages_session_id" ON "chat_messages" USING btree ("organization_id","session_id","id");--> statement-breakpoint
CREATE INDEX "idx_chat_messages_organization_conn_time" ON "chat_messages" USING btree ("organization_id","connection_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_chat_state_organization_conn" ON "chat_session_state" USING btree ("organization_id","connection_id");--> statement-breakpoint
CREATE INDEX "idx_chat_state_organization_tab" ON "chat_session_state" USING btree ("organization_id","active_tab_id");--> statement-breakpoint
CREATE INDEX "idx_chat_state_organization_updated" ON "chat_session_state" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_chat_sessions_list" ON "chat_sessions" USING btree ("organization_id","user_id","archived_at","last_message_at");--> statement-breakpoint
CREATE INDEX "idx_chat_sessions_organization_user_type" ON "chat_sessions" USING btree ("organization_id","user_id","type");--> statement-breakpoint
CREATE INDEX "idx_chat_sessions_organization_conn" ON "chat_sessions" USING btree ("organization_id","connection_id");--> statement-breakpoint
CREATE INDEX "idx_chat_sessions_organization_db" ON "chat_sessions" USING btree ("organization_id","active_database");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_chat_sessions_copilot_tab" ON "chat_sessions" USING btree ("organization_id","user_id","tab_id") WHERE "chat_sessions"."type" = 'copilot';--> statement-breakpoint
CREATE INDEX "idx_organization_created" ON "query_audit" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_source_created" ON "query_audit" USING btree ("source","created_at");--> statement-breakpoint
CREATE INDEX "idx_query_id" ON "query_audit" USING btree ("query_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_organization_id_user_id_unique" ON "members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_members_organization" ON "members" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_members_user" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_unique" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_conn_identity_connection_name" ON "connection_identities" USING btree ("connection_id","name") WHERE "connection_identities"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_conn_identity_cloud_id" ON "connection_identities" USING btree ("cloud_id") WHERE "connection_identities"."cloud_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_conn_identity_default_per_connection" ON "connection_identities" USING btree ("connection_id") WHERE "connection_identities"."is_default" = true AND "connection_identities"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_conn_identity_connection_id" ON "connection_identities" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "idx_conn_identity_created_by_user_id" ON "connection_identities" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_conn_identity_organization_id" ON "connection_identities" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_conn_identity_enabled" ON "connection_identities" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "idx_conn_identity_sync_status" ON "connection_identities" USING btree ("sync_status");--> statement-breakpoint
CREATE INDEX "idx_conn_identity_organization_cloud_id" ON "connection_identities" USING btree ("organization_id","cloud_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_connections_organization_name" ON "connections" USING btree ("organization_id","name") WHERE "connections"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_connections_cloud_id" ON "connections" USING btree ("cloud_id") WHERE "connections"."cloud_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_connections_organization_id_status" ON "connections" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_connections_created_by_user_id" ON "connections" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_connections_sync_status" ON "connections" USING btree ("sync_status");--> statement-breakpoint
CREATE INDEX "idx_connections_organization_cloud_id" ON "connections" USING btree ("organization_id","cloud_id");--> statement-breakpoint
CREATE INDEX "idx_connections_organization_env" ON "connections" USING btree ("organization_id","environment");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_ai_cache_organization_conn_catalog_feature_schema_model_prompt" ON "ai_schema_cache" USING btree ("organization_id","connection_id","catalog","feature","schema_hash","model","prompt_version");--> statement-breakpoint
CREATE INDEX "idx_ai_cache_organization_conn" ON "ai_schema_cache" USING btree ("organization_id","connection_id");--> statement-breakpoint
CREATE INDEX "idx_ai_cache_catalog_db_table" ON "ai_schema_cache" USING btree ("catalog","database_name","table_name");--> statement-breakpoint
CREATE INDEX "idx_ai_cache_schema_hash" ON "ai_schema_cache" USING btree ("schema_hash");--> statement-breakpoint
CREATE INDEX "idx_saved_queries_organization_user" ON "saved_queries" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_saved_queries_updated_at" ON "saved_queries" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_saved_queries_folder_id" ON "saved_queries" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "idx_saved_query_folders_organization_user" ON "saved_query_folders" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_ai_usage_events_request_id" ON "ai_usage_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_events_organization_created" ON "ai_usage_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_events_organization_created_total" ON "ai_usage_events" USING btree ("organization_id","created_at","total_tokens");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_events_organization_user_created" ON "ai_usage_events" USING btree ("organization_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_events_feature_created" ON "ai_usage_events" USING btree ("feature","created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_events_organization_feature_created" ON "ai_usage_events" USING btree ("organization_id","feature","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_ai_usage_traces_request_id" ON "ai_usage_traces" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_traces_organization_created" ON "ai_usage_traces" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_traces_organization_user_created" ON "ai_usage_traces" USING btree ("organization_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_traces_expires_at" ON "ai_usage_traces" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_sync_operations_organization_status" ON "sync_operations" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_sync_operations_entity" ON "sync_operations" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_sync_operations_created_at" ON "sync_operations" USING btree ("created_at");