UPDATE knowledge_models
SET business_context_md = COALESCE(
    model_json #>> '{ai_context,instructions}',
    CASE WHEN jsonb_typeof(model_json->'ai_context') = 'string' THEN model_json->>'ai_context' END,
    model_json #>> '{semantic_model,0,ai_context,instructions}',
    CASE WHEN jsonb_typeof(model_json #> '{semantic_model,0,ai_context}') = 'string' THEN model_json #>> '{semantic_model,0,ai_context}' END,
    business_context_md);
--> statement-breakpoint
CREATE TABLE knowledge_query_sources (
    knowledge_source_id text NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    query_id text NOT NULL REFERENCES knowledge_verified_queries(id) ON DELETE CASCADE,
    relation_type text NOT NULL,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_knowledge_query_sources PRIMARY KEY (knowledge_source_id, query_id)
);
--> statement-breakpoint
CREATE INDEX idx_knowledge_query_sources_query ON knowledge_query_sources(query_id);
--> statement-breakpoint
INSERT INTO knowledge_query_sources (knowledge_source_id, query_id, relation_type, created_by, created_at)
SELECT s.id, q.id, a.relation_type, a.created_by, a.created_at
FROM knowledge_asset_sources a
JOIN knowledge_sources s ON s.id = a.knowledge_source_id AND s.knowledge_model_id = a.knowledge_model_id
JOIN knowledge_verified_queries q ON q.id = a.asset_id AND q.knowledge_model_id = a.knowledge_model_id
WHERE a.asset_type = 'verified_query';
--> statement-breakpoint
DROP TABLE knowledge_asset_sources, knowledge_evidence, knowledge_metric_rules, knowledge_processing_history, knowledge_publication_jobs, knowledge_candidates, knowledge_business_rules, knowledge_organization_jobs, knowledge_extraction_jobs;
--> statement-breakpoint
ALTER TABLE knowledge_models DROP COLUMN model_json, DROP COLUMN model_yaml, DROP COLUMN publication_mode, DROP COLUMN publication_epoch;
--> statement-breakpoint
ALTER TABLE knowledge_verified_queries DROP COLUMN definition_ids;
--> statement-breakpoint
ALTER TABLE knowledge_connectors DROP COLUMN auto_extract;
