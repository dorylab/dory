CREATE TABLE "file_assets" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "created_by_user_id" text,
    "backend" text NOT NULL,
    "source_type" text NOT NULL,
    "path" text NOT NULL,
    "storage_key" text,
    "size_bytes" text,
    "mtime_ms" text,
    "status" text DEFAULT 'ready' NOT NULL,
    "metadata" text DEFAULT '{}' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "datasets" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "created_by_user_id" text,
    "connection_id" text NOT NULL,
    "name" text NOT NULL,
    "schema_name" text NOT NULL,
    "status" text DEFAULT 'ready' NOT NULL,
    "refresh_status" text DEFAULT 'idle' NOT NULL,
    "last_refresh_at" timestamp with time zone,
    "last_refresh_error" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dataset_relations" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "dataset_id" text NOT NULL,
    "file_asset_id" text NOT NULL,
    "source_type" text NOT NULL,
    "sheet_name" text,
    "relation_name" text NOT NULL,
    "mode" text DEFAULT 'virtual' NOT NULL,
    "duckdb_schema" text NOT NULL,
    "duckdb_relation" text NOT NULL,
    "physical_table_name" text,
    "source_fingerprint" text,
    "last_source_fingerprint" text,
    "schema_drift_status" text DEFAULT 'unknown' NOT NULL,
    "refresh_strategy" text DEFAULT 'manual' NOT NULL,
    "read_sql" text NOT NULL,
    "status" text DEFAULT 'ready' NOT NULL,
    "last_refresh_at" timestamp with time zone,
    "last_refresh_error" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dataset_refresh_operations" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "dataset_id" text NOT NULL,
    "relation_id" text,
    "operation_type" text DEFAULT 'refresh' NOT NULL,
    "status" text DEFAULT 'running' NOT NULL,
    "reason" text DEFAULT 'manual' NOT NULL,
    "source_fingerprint" text,
    "previous_source_fingerprint" text,
    "schema_drift_status" text DEFAULT 'unknown' NOT NULL,
    "error" text,
    "started_at" timestamp with time zone DEFAULT now() NOT NULL,
    "finished_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dataset_relation_columns" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "dataset_id" text NOT NULL,
    "relation_id" text NOT NULL,
    "column_name" text NOT NULL,
    "column_type" text NOT NULL,
    "nullable" text,
    "detected_semantic" text,
    "sample_values" text DEFAULT '[]' NOT NULL,
    "summary" text DEFAULT '{}' NOT NULL,
    "ordinal_position" integer DEFAULT 0 NOT NULL,
    "refreshed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_file_assets_organization" ON "file_assets" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "idx_file_assets_org_backend_path" ON "file_assets" USING btree ("organization_id","backend","path");
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_datasets_organization_schema" ON "datasets" USING btree ("organization_id","schema_name") WHERE "datasets"."deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "idx_datasets_organization" ON "datasets" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "idx_datasets_connection" ON "datasets" USING btree ("connection_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_dataset_relations_name" ON "dataset_relations" USING btree ("dataset_id","relation_name") WHERE "dataset_relations"."deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "idx_dataset_relations_organization" ON "dataset_relations" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "idx_dataset_relations_dataset" ON "dataset_relations" USING btree ("dataset_id");
--> statement-breakpoint
CREATE INDEX "idx_dataset_relations_file_asset" ON "dataset_relations" USING btree ("file_asset_id");
--> statement-breakpoint
CREATE INDEX "idx_dataset_refresh_ops_organization" ON "dataset_refresh_operations" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "idx_dataset_refresh_ops_dataset" ON "dataset_refresh_operations" USING btree ("dataset_id");
--> statement-breakpoint
CREATE INDEX "idx_dataset_refresh_ops_relation" ON "dataset_refresh_operations" USING btree ("relation_id");
--> statement-breakpoint
CREATE INDEX "idx_dataset_refresh_ops_status" ON "dataset_refresh_operations" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_dataset_relation_columns_name" ON "dataset_relation_columns" USING btree ("relation_id","column_name");
--> statement-breakpoint
CREATE INDEX "idx_dataset_relation_columns_organization" ON "dataset_relation_columns" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "idx_dataset_relation_columns_dataset" ON "dataset_relation_columns" USING btree ("dataset_id");
--> statement-breakpoint
CREATE INDEX "idx_dataset_relation_columns_relation" ON "dataset_relation_columns" USING btree ("relation_id");
