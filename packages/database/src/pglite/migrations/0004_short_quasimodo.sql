ALTER TABLE "saved_query_folders" ADD COLUMN "connection_id" text;--> statement-breakpoint
UPDATE "saved_query_folders" AS "folders"
SET "connection_id" = "folder_connections"."connection_id"
FROM (
    SELECT
        "folder_id",
        min("connection_id") AS "connection_id"
    FROM "saved_queries"
    WHERE "folder_id" IS NOT NULL
    GROUP BY "folder_id"
) AS "folder_connections"
WHERE "folders"."id" = "folder_connections"."folder_id";--> statement-breakpoint
UPDATE "saved_query_folders" AS "folders"
SET "connection_id" = COALESCE(
    (
        SELECT "saved_queries"."connection_id"
        FROM "saved_queries"
        WHERE "saved_queries"."organization_id" = "folders"."organization_id"
          AND "saved_queries"."user_id" = "folders"."user_id"
        ORDER BY "saved_queries"."updated_at" DESC NULLS LAST, "saved_queries"."created_at" DESC NULLS LAST
        LIMIT 1
    ),
    (
        SELECT "connections"."id"
        FROM "connections"
        WHERE "connections"."organization_id" = "folders"."organization_id"
          AND "connections"."deleted_at" IS NULL
        ORDER BY "connections"."updated_at" DESC NULLS LAST, "connections"."created_at" DESC NULLS LAST, "connections"."id" ASC
        LIMIT 1
    ),
    "folders"."id"
)
WHERE "folders"."connection_id" IS NULL;--> statement-breakpoint
UPDATE "saved_queries" AS "queries"
SET "folder_id" = NULL,
    "updated_at" = NOW()
FROM "saved_query_folders" AS "folders"
WHERE "queries"."folder_id" = "folders"."id"
  AND "queries"."connection_id" <> "folders"."connection_id";--> statement-breakpoint
ALTER TABLE "saved_query_folders" ALTER COLUMN "connection_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_saved_query_folders_connection_id" ON "saved_query_folders" USING btree ("connection_id");
