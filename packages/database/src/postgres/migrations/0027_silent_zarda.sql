CREATE TABLE "artifacts" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "type" text NOT NULL,
    "title" text NOT NULL,
    "status" text DEFAULT 'ready' NOT NULL,
    "resource_id" text NOT NULL,
    "parent_artifact_id" text,
    "source_result_set_id" text,
    "connection_id" text,
    "work_id" text,
    "agent_run_id" text,
    "comparison_id" text,
    "comparison_run_id" text,
    "source_type" text,
    "created_by_actor_type" text NOT NULL,
    "created_by_actor_id" text,
    "chart_state" jsonb,
    "file_name" text,
    "file_format" text,
    "byte_size" bigint,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_artifacts_org_resource" ON "artifacts" USING btree ("organization_id","type","resource_id");
--> statement-breakpoint
CREATE INDEX "idx_artifacts_org_created" ON "artifacts" USING btree ("organization_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_artifacts_org_type_created" ON "artifacts" USING btree ("organization_id","type","created_at");
--> statement-breakpoint
CREATE INDEX "idx_artifacts_source_result_set" ON "artifacts" USING btree ("organization_id","source_result_set_id");
--> statement-breakpoint
CREATE INDEX "idx_artifacts_expires_at" ON "artifacts" USING btree ("expires_at");
--> statement-breakpoint
INSERT INTO "artifacts" (
    "id", "organization_id", "type", "title", "status", "resource_id",
    "source_result_set_id", "connection_id", "work_id", "agent_run_id",
    "comparison_id", "comparison_run_id", "source_type",
    "created_by_actor_type", "created_by_actor_id", "byte_size",
    "expires_at", "created_at", "updated_at"
)
SELECT
    'artifact_' || rs."id", rs."organization_id", 'result_set',
    COALESCE(NULLIF(wqrs."title", ''), NULLIF(w."title", ''), 'Result Set ' || substring(rs."id" from 4 for 8)),
    CASE WHEN rs."data_availability" = 'none' THEN 'unavailable' ELSE 'ready' END,
    rs."id", rs."id", rs."connection_id", rs."work_id", rs."agent_run_id",
    rs."comparison_id", rs."comparison_run_id", rs."source_type",
    rs."created_by_actor_type", rs."created_by_actor_id", rs."byte_size",
    rs."expires_at", rs."created_at", rs."updated_at"
FROM "result_sets" rs
LEFT JOIN "work_query_result_sets" wqrs ON wqrs."work_id" = rs."work_id" AND wqrs."session_id" = rs."session_id" AND wqrs."set_index" = rs."set_index"
LEFT JOIN "works" w ON w."work_id" = rs."work_id"
ON CONFLICT ("organization_id", "type", "resource_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "artifacts" (
    "id", "organization_id", "type", "title", "status", "resource_id",
    "parent_artifact_id", "source_result_set_id", "connection_id", "work_id",
    "agent_run_id", "comparison_id", "comparison_run_id", "source_type",
    "created_by_actor_type", "created_by_actor_id", "file_name", "file_format",
    "byte_size", "expires_at", "created_at", "updated_at"
)
SELECT
    'artifact_' || rse."id", rse."organization_id", 'file', rse."file_name", 'ready', rse."id",
    'artifact_' || rs."id", rse."result_set_id", rs."connection_id", rs."work_id",
    rs."agent_run_id", rs."comparison_id", rs."comparison_run_id", rs."source_type",
    rs."created_by_actor_type", rs."created_by_actor_id", rse."file_name", rse."format",
    rse."byte_size", rse."expires_at", rse."created_at", rse."created_at"
FROM "result_set_exports" rse
JOIN "result_sets" rs ON rs."organization_id" = rse."organization_id" AND rs."id" = rse."result_set_id"
WHERE rse."expires_at" > now()
ON CONFLICT ("organization_id", "type", "resource_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "artifacts" (
    "id", "organization_id", "type", "title", "status", "resource_id",
    "parent_artifact_id", "source_result_set_id", "connection_id", "work_id",
    "agent_run_id", "source_type", "created_by_actor_type", "created_by_actor_id",
    "chart_state", "expires_at", "created_at", "updated_at"
)
SELECT
    'artifact_chart_' || wcs."work_id" || '_' || wcs."session_id" || '_' || wcs."set_index" || '_' || wcs."state_key",
    rs."organization_id", 'chart',
    COALESCE(NULLIF(wqrs."title", '') || ' chart', 'Chart ' || substring(rs."id" from 4 for 8)),
    'ready',
    'chart_' || wcs."work_id" || '_' || wcs."session_id" || '_' || wcs."set_index" || '_' || wcs."state_key",
    'artifact_' || rs."id", rs."id", rs."connection_id", rs."work_id", rs."agent_run_id",
    rs."source_type", rs."created_by_actor_type", rs."created_by_actor_id", wcs."chart_state",
    rs."expires_at", wcs."updated_at", wcs."updated_at"
FROM "work_chart_states" wcs
JOIN "result_sets" rs ON rs."work_id" = wcs."work_id" AND rs."session_id" = wcs."session_id" AND rs."set_index" = wcs."set_index"
LEFT JOIN "work_query_result_sets" wqrs ON wqrs."work_id" = wcs."work_id" AND wqrs."session_id" = wcs."session_id" AND wqrs."set_index" = wcs."set_index"
WHERE jsonb_typeof(wcs."chart_state") = 'object'
ON CONFLICT ("organization_id", "type", "resource_id") DO NOTHING;
