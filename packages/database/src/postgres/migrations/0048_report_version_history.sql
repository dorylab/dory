DO $story$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'work_documents' AND column_name = 'published_version_id') THEN
        LOCK TABLE work_documents, work_document_versions, report_publications, report_working_drafts IN ACCESS EXCLUSIVE MODE;
        IF EXISTS (
            SELECT 1 FROM work_documents d
            WHERE jsonb_typeof(d.content->'markdown') IS DISTINCT FROM 'string'
               OR jsonb_typeof(d.content->'visuals') IS DISTINCT FROM 'array'
               OR (d.content->>'format' = 'restricted-mdx' AND jsonb_typeof(d.content->'body') IS DISTINCT FROM 'string')
               OR jsonb_typeof(d.content->'evidence') IS DISTINCT FROM 'array'
               OR EXISTS (
                   SELECT 1 FROM jsonb_array_elements(d.content->'evidence') e
                   WHERE nullif(e->>'artifactId', '') IS NULL OR jsonb_typeof(e->'columns') IS DISTINCT FROM 'array' OR jsonb_typeof(e->'rows') IS DISTINCT FROM 'array'
                      OR e->>'snapshotId' IS NOT NULL AND NOT EXISTS (
                       SELECT 1 FROM report_snapshots s WHERE s.document_id = d.id AND s.id = e->>'snapshotId' AND s.evidence->>'artifactId' = e->>'artifactId'
                   )
               ) OR EXISTS (
                   SELECT 1 FROM jsonb_array_elements(d.content->'visuals') v WHERE NOT EXISTS (
                       SELECT 1 FROM jsonb_array_elements(d.content->'evidence') e WHERE e->>'artifactId' = v->>'evidenceId')
               ) OR EXISTS (
                   SELECT 1 FROM jsonb_array_elements(d.content->'evidenceGroups') g, jsonb_array_elements(g->'references') r WHERE NOT EXISTS (
                       SELECT 1 FROM jsonb_array_elements(d.content->'evidence') e WHERE e->>'artifactId' = r->>'artifactId')
               ) OR EXISTS (
                   SELECT 1 FROM jsonb_each(d.content->'embeds') pair
                   WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d.content->'evidence') e
                       WHERE e->>'snapshotId' = pair.value->>'snapshotId' AND e->>'artifactId' = pair.value->>'artifactId')
               )
        ) THEN RAISE EXCEPTION 'Cannot reset report history: invalid current content or evidence'; END IF;
        ALTER TABLE work_document_versions ADD COLUMN request_key text, ADD COLUMN source_chat_id text;
        WITH anchors AS (
            SELECT d.id, d.revision, greatest(d.revision, coalesce(max(v.revision), 0)) + 1 AS next_revision
            FROM work_documents d LEFT JOIN work_document_versions v ON v.document_id = d.id
            GROUP BY d.id, d.revision
        ), active_drafts AS (
            SELECT DISTINCT ON (w.document_id, w.user_id) w.document_id, w.user_id, w.base_revision, a.next_revision
            FROM report_working_drafts w JOIN anchors a ON a.id = w.document_id AND a.revision = w.expected_report_revision
            ORDER BY w.document_id, w.user_id, (w.base_revision = a.revision) DESC, w.updated_at DESC, w.base_revision DESC
        )
        UPDATE report_working_drafts w
        SET base_revision = a.next_revision, expected_report_revision = a.next_revision, revision = w.revision + 1,
            state = w.state
                || CASE WHEN jsonb_typeof(w.state->'baseline') = 'object'
                        THEN jsonb_build_object('baseline', (w.state->'baseline') || jsonb_build_object('revision', a.next_revision, 'version', 1))
                        ELSE '{}'::jsonb END
                || CASE WHEN jsonb_typeof(w.state->'canvas') = 'object'
                        THEN jsonb_build_object('canvas', (w.state->'canvas') || jsonb_build_object('baselineRevision', a.next_revision))
                        ELSE '{}'::jsonb END
        FROM active_drafts a WHERE w.document_id = a.document_id AND w.user_id = a.user_id AND w.base_revision = a.base_revision;
        UPDATE work_documents d SET revision = greatest(d.revision, coalesce((SELECT max(v.revision) FROM work_document_versions v WHERE v.document_id = d.id), 0)) + 1;
        DELETE FROM work_document_versions;
        INSERT INTO work_document_versions(document_id, revision, title, content, scope, status, source, created_at)
            SELECT id, revision, title, content, scope, status, 'baseline', updated_at FROM work_documents;
        DROP TABLE report_publications;
        ALTER TABLE work_documents DROP COLUMN published_version_id;
    END IF;
END
$story$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS work_document_versions_request ON work_document_versions(document_id, request_key);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS report_agent_drafts (
    document_id text NOT NULL REFERENCES work_documents(id) ON DELETE CASCADE,
    request_id text NOT NULL, completed_revision integer, base_revision integer NOT NULL, revision integer NOT NULL,
    title text NOT NULL, content jsonb NOT NULL, scope jsonb NOT NULL, status text NOT NULL,
    source_chat_id text, PRIMARY KEY(document_id, request_id)
);
