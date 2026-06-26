ALTER TABLE "tabs" ADD COLUMN IF NOT EXISTS "work_id" text;--> statement-breakpoint

CREATE TABLE "works" (
    "work_id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "user_id" text NOT NULL,
    "token_id" text,
    "connection_id" text,
    "external_session_id" text,
    "title" text DEFAULT 'Agent Run' NOT NULL,
    "status" text DEFAULT 'active' NOT NULL,
    "metadata" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
    "archived_at" timestamp with time zone
);--> statement-breakpoint

CREATE INDEX "idx_works_org_user_active" ON "works" USING btree ("organization_id","user_id","last_active_at");--> statement-breakpoint
CREATE INDEX "idx_works_external_session" ON "works" USING btree ("organization_id","user_id","token_id","connection_id","external_session_id");--> statement-breakpoint
CREATE INDEX "idx_works_connection_active" ON "works" USING btree ("organization_id","connection_id","last_active_at");--> statement-breakpoint

CREATE TABLE "work_events" (
    "event_id" text PRIMARY KEY NOT NULL,
    "work_id" text NOT NULL,
    "organization_id" text NOT NULL,
    "user_id" text NOT NULL,
    "token_id" text,
    "connection_id" text,
    "tool_name" text NOT NULL,
    "action_id" text,
    "status" text NOT NULL,
    "input_summary" jsonb,
    "output_summary" jsonb,
    "error_code" text,
    "error_message" text,
    "duration_ms" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX "idx_work_events_work_created" ON "work_events" USING btree ("work_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_work_events_org_created" ON "work_events" USING btree ("organization_id","created_at");--> statement-breakpoint

CREATE TABLE "work_query_sessions" (
    "work_id" text NOT NULL,
    "session_id" text NOT NULL,
    "user_id" text NOT NULL,
    "tab_id" text NOT NULL,
    "connection_id" text,
    "database" text,
    "sql_text" text NOT NULL,
    "status" text DEFAULT 'success' NOT NULL,
    "error_message" text,
    "started_at" timestamp with time zone DEFAULT now() NOT NULL,
    "finished_at" timestamp with time zone,
    "elapsed_ms" integer,
    "result_set_count" integer DEFAULT 0 NOT NULL,
    "stop_on_error" boolean DEFAULT false NOT NULL,
    "source" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "pk_work_query_sessions" PRIMARY KEY("work_id","session_id")
);--> statement-breakpoint

CREATE INDEX "idx_work_query_sessions_work" ON "work_query_sessions" USING btree ("work_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_work_query_sessions_tab" ON "work_query_sessions" USING btree ("tab_id");--> statement-breakpoint

CREATE TABLE "work_query_result_sets" (
    "work_id" text NOT NULL,
    "session_id" text NOT NULL,
    "set_index" integer NOT NULL,
    "sql_text" text NOT NULL,
    "sql_op" text,
    "title" text,
    "columns" jsonb,
    "stats" jsonb,
    "view_state" jsonb,
    "ai_profile_version" integer DEFAULT 1 NOT NULL,
    "row_count" integer,
    "limited" boolean DEFAULT false NOT NULL,
    "limit" integer,
    "affected_rows" integer,
    "status" text DEFAULT 'success' NOT NULL,
    "error_message" text,
    "error_code" text,
    "error_sql_state" text,
    "error_meta" jsonb,
    "warnings" jsonb,
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "duration_ms" integer,
    CONSTRAINT "pk_work_query_result_sets" PRIMARY KEY("work_id","session_id","set_index")
);--> statement-breakpoint

CREATE INDEX "idx_work_qrs_session" ON "work_query_result_sets" USING btree ("work_id","session_id","set_index");--> statement-breakpoint

CREATE TABLE "work_query_result_pages" (
    "work_id" text NOT NULL,
    "session_id" text NOT NULL,
    "set_index" integer NOT NULL,
    "page_no" integer NOT NULL,
    "first_row_index" integer NOT NULL,
    "row_count" integer NOT NULL,
    "rows_data" bytea NOT NULL,
    "is_gzip" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "pk_work_query_result_pages" PRIMARY KEY("work_id","session_id","set_index","page_no")
);--> statement-breakpoint

CREATE INDEX "idx_work_qrp_read" ON "work_query_result_pages" USING btree ("work_id","session_id","set_index","page_no");--> statement-breakpoint

CREATE TABLE "work_chart_states" (
    "work_id" text NOT NULL,
    "session_id" text NOT NULL,
    "set_index" integer NOT NULL,
    "state_key" text NOT NULL,
    "chart_state" jsonb NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "pk_work_chart_states" PRIMARY KEY("work_id","session_id","set_index","state_key")
);--> statement-breakpoint

CREATE INDEX "idx_work_chart_states_work" ON "work_chart_states" USING btree ("work_id");
