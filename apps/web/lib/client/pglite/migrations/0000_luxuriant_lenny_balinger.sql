CREATE TYPE "public"."query_result_status" AS ENUM('success', 'error');--> statement-breakpoint
CREATE TYPE "public"."query_session_status" AS ENUM('running', 'success', 'error', 'canceled');--> statement-breakpoint
CREATE TABLE "query_result_page" (
	"session_id" text NOT NULL,
	"set_index" integer NOT NULL,
	"page_no" integer NOT NULL,
	"first_row_index" integer NOT NULL,
	"row_count" integer NOT NULL,
	"rows_data" "bytea" NOT NULL,
	"is_gzip" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pk_qrp" PRIMARY KEY("session_id","set_index","page_no"),
	CONSTRAINT "chk_qrp_pageno_nonneg" CHECK ("query_result_page"."page_no" >= 0),
	CONSTRAINT "chk_qrp_firstrow_nonneg" CHECK ("query_result_page"."first_row_index" >= 0),
	CONSTRAINT "chk_qrp_rowcount_pos" CHECK ("query_result_page"."row_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "query_result_set" (
	"session_id" text NOT NULL,
	"set_index" integer NOT NULL,
	"sql_text" text NOT NULL,
	"sql_op" text,
	"title" text,
	"columns" jsonb,
	"row_count" integer,
	"limited" boolean DEFAULT false NOT NULL,
	"limit" integer,
	"affected_rows" integer,
	"status" "query_result_status" DEFAULT 'success' NOT NULL,
	"error_message" text,
	"error_code" text,
	"error_sql_state" text,
	"error_meta" jsonb,
	"warnings" jsonb,
	"started_at" timestamp (3),
	"finished_at" timestamp (3),
	"duration_ms" integer,
	CONSTRAINT "pk_qrs" PRIMARY KEY("session_id","set_index"),
	CONSTRAINT "chk_qrs_setindex_nonneg" CHECK ("query_result_set"."set_index" >= 0),
	CONSTRAINT "chk_qrs_rowcount_nonneg" CHECK ("query_result_set"."row_count" IS NULL OR "query_result_set"."row_count" >= 0),
	CONSTRAINT "chk_qrs_affected_nonneg" CHECK ("query_result_set"."affected_rows" IS NULL OR "query_result_set"."affected_rows" >= 0),
	CONSTRAINT "chk_qrs_duration_nonneg" CHECK ("query_result_set"."duration_ms" IS NULL OR "query_result_set"."duration_ms" >= 0),
	CONSTRAINT "chk_qrs_limit_nonneg" CHECK ("query_result_set"."limit" IS NULL OR "query_result_set"."limit" >= 0)
);
--> statement-breakpoint
CREATE TABLE "query_session" (
	"session_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tab_id" text NOT NULL,
	"connection_id" text,
	"database" text,
	"sql_text" text NOT NULL,
	"status" "query_session_status" DEFAULT 'running' NOT NULL,
	"error_message" text,
	"started_at" timestamp (3) DEFAULT now() NOT NULL,
	"finished_at" timestamp (3),
	"elapsed_ms" integer,
	"result_set_count" integer DEFAULT 0 NOT NULL,
	"stop_on_error" boolean DEFAULT false NOT NULL,
	"source" text,
	CONSTRAINT "chk_qs_elapsed_nonneg" CHECK ("query_session"."elapsed_ms" IS NULL OR "query_session"."elapsed_ms" >= 0)
);
--> statement-breakpoint
ALTER TABLE "query_result_page" ADD CONSTRAINT "fk_qrp_resultset" FOREIGN KEY ("session_id","set_index") REFERENCES "public"."query_result_set"("session_id","set_index") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_result_set" ADD CONSTRAINT "fk_qrs_session" FOREIGN KEY ("session_id") REFERENCES "public"."query_session"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_qrp_read" ON "query_result_page" USING btree ("session_id","set_index","page_no");--> statement-breakpoint
CREATE INDEX "idx_qrs_session" ON "query_result_set" USING btree ("session_id","set_index");--> statement-breakpoint
CREATE INDEX "idx_qrs_status" ON "query_result_set" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_qrs_sqlop" ON "query_result_set" USING btree ("sql_op");--> statement-breakpoint
CREATE INDEX "idx_qs_user_tab_time" ON "query_session" USING btree ("user_id","tab_id","started_at");