ALTER TABLE knowledge_models ADD COLUMN publication_mode text NOT NULL DEFAULT 'review';
--> statement-breakpoint
ALTER TABLE knowledge_models ADD COLUMN publication_epoch integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE knowledge_extraction_jobs ADD COLUMN publication_epoch integer;
--> statement-breakpoint
ALTER TABLE knowledge_candidates ADD COLUMN publication_epoch integer;
--> statement-breakpoint
ALTER TABLE knowledge_candidates ADD COLUMN manual_only integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE knowledge_candidates ADD COLUMN classification_reason text;
--> statement-breakpoint
ALTER TABLE knowledge_business_rules ADD COLUMN publication_method text NOT NULL DEFAULT 'human';
--> statement-breakpoint
CREATE TABLE knowledge_publication_jobs (
 id text PRIMARY KEY, organization_id text NOT NULL,
 knowledge_model_id text NOT NULL REFERENCES knowledge_models(id) ON DELETE CASCADE,
 candidate_id text NOT NULL REFERENCES knowledge_candidates(id) ON DELETE CASCADE,
 publication_epoch integer NOT NULL, status text NOT NULL DEFAULT 'queued', attempts integer NOT NULL DEFAULT 0,
 lease_token text, lease_expires_at timestamptz, available_at timestamptz NOT NULL DEFAULT now(), error text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX uidx_publication_candidate ON knowledge_publication_jobs(candidate_id);
--> statement-breakpoint
CREATE INDEX idx_publication_queue ON knowledge_publication_jobs(status, available_at);
--> statement-breakpoint
CREATE TABLE knowledge_processing_history (
 id text PRIMARY KEY, organization_id text NOT NULL,
 knowledge_model_id text NOT NULL REFERENCES knowledge_models(id) ON DELETE CASCADE,
 candidate_id text REFERENCES knowledge_candidates(id) ON DELETE SET NULL,
 kind text NOT NULL, asset_id text, asset_revision text, publication_epoch integer, actor_id text, reason text,
 payload jsonb NOT NULL, evidence jsonb NOT NULL DEFAULT '[]'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX idx_processing_history_model ON knowledge_processing_history(organization_id, knowledge_model_id);
--> statement-breakpoint
INSERT INTO knowledge_organization_jobs(id, organization_id, knowledge_model_id)
SELECT 'koj_classification_' || knowledge_model_id, organization_id, knowledge_model_id
FROM knowledge_candidates WHERE status = 'pending' AND action NOT IN ('source_changed', 'remove') GROUP BY organization_id, knowledge_model_id
ON CONFLICT (knowledge_model_id) DO UPDATE SET status = 'queued', attempts = 0, generation = knowledge_organization_jobs.generation + 1, lease_token = NULL, error = NULL, available_at = now();
