CREATE TABLE saved_query_collections (
    query_id text NOT NULL REFERENCES saved_queries(id) ON DELETE CASCADE,
    user_id text NOT NULL,
    folder_id text,
    position integer NOT NULL DEFAULT 0,
    context jsonb NOT NULL DEFAULT '{}',
    tags text[] NOT NULL DEFAULT '{}',
    work_id uuid,
    archived_at timestamptz,
    PRIMARY KEY (query_id, user_id)
);
--> statement-breakpoint
CREATE INDEX idx_query_collections_user_folder ON saved_query_collections(user_id, folder_id, position);
--> statement-breakpoint
INSERT INTO saved_query_collections (query_id, user_id, folder_id, position, context, tags, work_id, archived_at)
SELECT id, user_id, folder_id, position, context, tags, work_id, archived_at FROM saved_queries;
--> statement-breakpoint
ALTER TABLE saved_queries DROP COLUMN user_id, DROP COLUMN folder_id, DROP COLUMN position, DROP COLUMN context,
    DROP COLUMN tags, DROP COLUMN work_id, DROP COLUMN archived_at, ADD COLUMN revision integer NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE INDEX idx_saved_queries_org_connection ON saved_queries(organization_id, connection_id);
--> statement-breakpoint
CREATE TABLE knowledge_query_memberships (
    knowledge_model_id text NOT NULL REFERENCES knowledge_models(id) ON DELETE CASCADE,
    id text NOT NULL,
    saved_query_id text NOT NULL REFERENCES saved_queries(id) ON DELETE CASCADE,
    source_connection_id text NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    question text NOT NULL,
    source_type text NOT NULL DEFAULT 'manual',
    source_id text,
    created_by text,
    updated_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (knowledge_model_id, id),
    CONSTRAINT uq_memberships_model_query UNIQUE (knowledge_model_id, saved_query_id)
);
--> statement-breakpoint
CREATE INDEX idx_memberships_saved_query ON knowledge_query_memberships(saved_query_id);
--> statement-breakpoint
CREATE TEMP TABLE unified_query_map ON COMMIT DROP AS
SELECT k.id, CASE
    WHEN s.id IS NOT NULL AND count(s.id) OVER (PARTITION BY k.knowledge_model_id, s.id) = 1 THEN s.id
    WHEN collision.id IS NULL THEN k.id
    ELSE 'kb_' || gen_random_uuid()::text END AS query_id
FROM knowledge_verified_queries k JOIN knowledge_models m ON m.id = k.knowledge_model_id
LEFT JOIN saved_queries s ON k.source_type = 'saved_query' AND s.id = k.source_id
    AND s.organization_id = m.organization_id AND s.connection_id = k.source_connection_id
    AND s.sql_text = k.sql AND s.title = k.title AND s.description IS NOT DISTINCT FROM k.description
LEFT JOIN saved_queries collision ON collision.id = k.id;
--> statement-breakpoint
INSERT INTO saved_queries (id, organization_id, connection_id, title, description, sql_text, created_at, updated_at)
SELECT map.query_id, m.organization_id, k.source_connection_id, k.title, k.description, k.sql, k.created_at, k.updated_at
FROM knowledge_verified_queries k JOIN unified_query_map map ON map.id = k.id JOIN knowledge_models m ON m.id = k.knowledge_model_id
WHERE NOT EXISTS (SELECT 1 FROM saved_queries s WHERE s.id = map.query_id);
--> statement-breakpoint
INSERT INTO knowledge_query_memberships (knowledge_model_id, id, saved_query_id, source_connection_id, question, source_type, source_id, created_by, updated_by, created_at, updated_at)
SELECT k.knowledge_model_id, k.id, map.query_id, k.source_connection_id, k.question, k.source_type, k.source_id, k.created_by, k.updated_by, k.created_at, k.updated_at
FROM knowledge_verified_queries k JOIN unified_query_map map ON map.id = k.id;
--> statement-breakpoint
ALTER TABLE knowledge_query_sources ADD COLUMN knowledge_model_id text;
--> statement-breakpoint
UPDATE knowledge_query_sources l SET knowledge_model_id = k.knowledge_model_id FROM knowledge_verified_queries k WHERE k.id = l.query_id;
--> statement-breakpoint
ALTER TABLE knowledge_query_sources ALTER COLUMN knowledge_model_id SET NOT NULL,
    DROP CONSTRAINT knowledge_query_sources_query_id_fkey,
    ADD FOREIGN KEY (knowledge_model_id, query_id) REFERENCES knowledge_query_memberships(knowledge_model_id, id) ON DELETE CASCADE;
--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (
        SELECT FROM knowledge_verified_queries old
        JOIN knowledge_models kb ON kb.id = old.knowledge_model_id
        LEFT JOIN knowledge_query_memberships m ON m.id = old.id AND m.knowledge_model_id = old.knowledge_model_id
        LEFT JOIN saved_queries q ON q.id = m.saved_query_id
        WHERE q.id IS NULL OR q.organization_id <> kb.organization_id OR q.connection_id <> old.source_connection_id
            OR q.sql_text <> old.sql OR q.title <> old.title OR q.description IS DISTINCT FROM old.description
    ) THEN RAISE EXCEPTION 'Verified SQL migration reconciliation failed'; END IF;
END $$;
--> statement-breakpoint
DROP TABLE knowledge_verified_queries;
--> statement-breakpoint
CREATE VIEW knowledge_verified_query_details AS
SELECT m.id, m.saved_query_id, m.knowledge_model_id, m.source_connection_id, q.title, m.question, q.sql_text AS sql,
    q.description, q.revision, m.source_type, m.source_id, m.created_by, m.updated_by, m.created_at,
    greatest(q.updated_at, m.updated_at) AS updated_at
FROM knowledge_query_memberships m JOIN saved_queries q ON q.id = m.saved_query_id;
--> statement-breakpoint
CREATE FUNCTION collect_unreferenced_query() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target text;
BEGIN
    IF TG_TABLE_NAME = 'saved_query_collections' THEN target := OLD.query_id; ELSE target := OLD.saved_query_id; END IF;
    PERFORM 1 FROM saved_queries WHERE id = target FOR UPDATE;
    DELETE FROM saved_queries WHERE id = target
        AND NOT EXISTS (SELECT FROM saved_query_collections WHERE query_id = target)
        AND NOT EXISTS (SELECT FROM knowledge_query_memberships WHERE saved_query_id = target);
    RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER collect_after_uncollect AFTER DELETE ON saved_query_collections FOR EACH ROW EXECUTE FUNCTION collect_unreferenced_query();
--> statement-breakpoint
CREATE TRIGGER collect_after_unlink AFTER DELETE ON knowledge_query_memberships FOR EACH ROW EXECUTE FUNCTION collect_unreferenced_query();
--> statement-breakpoint
CREATE TABLE query_save_requests (
    organization_id text NOT NULL, user_id text NOT NULL, request_id text NOT NULL, fingerprint text NOT NULL,
    knowledge_model_id text, query_id text, PRIMARY KEY (organization_id, user_id, request_id),
    FOREIGN KEY (knowledge_model_id, query_id) REFERENCES knowledge_query_memberships(knowledge_model_id, id) ON DELETE CASCADE
);
