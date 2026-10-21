ALTER TABLE knowledge_business_rules ADD COLUMN application_scope text NOT NULL DEFAULT 'model';
--> statement-breakpoint
UPDATE knowledge_business_rules SET application_scope = CASE WHEN payload->>'sourceConnectionId' IS NULL THEN 'model' ELSE 'data_source' END;
--> statement-breakpoint
ALTER TABLE knowledge_extraction_jobs ADD COLUMN staged_output jsonb;
--> statement-breakpoint
CREATE TABLE knowledge_metric_rules (
    organization_id text NOT NULL,
    knowledge_model_id text NOT NULL REFERENCES knowledge_models(id) ON DELETE CASCADE,
    metric_id text NOT NULL,
    rule_id text NOT NULL REFERENCES knowledge_business_rules(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX uidx_metric_rules ON knowledge_metric_rules(knowledge_model_id, metric_id, rule_id);
--> statement-breakpoint
CREATE TABLE knowledge_organization_jobs (
    id text PRIMARY KEY,
    organization_id text NOT NULL,
    knowledge_model_id text NOT NULL REFERENCES knowledge_models(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'queued',
    generation integer NOT NULL DEFAULT 1,
    attempts integer NOT NULL DEFAULT 0,
    lease_token text,
    lease_expires_at timestamptz,
    available_at timestamptz NOT NULL DEFAULT now(),
    error text,
    updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX uidx_knowledge_organization_model ON knowledge_organization_jobs(knowledge_model_id);
--> statement-breakpoint
CREATE INDEX idx_knowledge_organization_queue ON knowledge_organization_jobs(status, available_at);
--> statement-breakpoint
INSERT INTO knowledge_organization_jobs(id, organization_id, knowledge_model_id)
SELECT 'koj_upgrade_' || knowledge_model_id, organization_id, knowledge_model_id FROM knowledge_candidates WHERE status = 'pending' AND action NOT IN ('source_changed', 'remove') GROUP BY organization_id, knowledge_model_id;
