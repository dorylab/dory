ALTER TABLE knowledge_connectors ADD COLUMN auto_extract boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE TABLE knowledge_extraction_jobs (
 id text PRIMARY KEY, organization_id text NOT NULL, knowledge_model_id text NOT NULL REFERENCES knowledge_models(id) ON DELETE CASCADE,
 connector_id text NOT NULL REFERENCES knowledge_connectors(id) ON DELETE CASCADE, source_id text REFERENCES knowledge_sources(id) ON DELETE SET NULL,
 original_source_id text NOT NULL, source_hash text NOT NULL, extraction_version integer NOT NULL DEFAULT 1,
 status text NOT NULL DEFAULT 'queued', attempts integer NOT NULL DEFAULT 0, completed_chunks integer NOT NULL DEFAULT 0, total_chunks integer NOT NULL DEFAULT 0,
 lease_token text, lease_expires_at timestamptz, available_at timestamptz NOT NULL DEFAULT now(), error text, created_by text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX uidx_extraction_source_version ON knowledge_extraction_jobs(original_source_id, source_hash, extraction_version);
--> statement-breakpoint
CREATE INDEX idx_extraction_queue ON knowledge_extraction_jobs(status, available_at);
--> statement-breakpoint
CREATE INDEX idx_extraction_model ON knowledge_extraction_jobs(organization_id, knowledge_model_id);
--> statement-breakpoint
CREATE TABLE knowledge_candidates (
 id text PRIMARY KEY, organization_id text NOT NULL, knowledge_model_id text NOT NULL REFERENCES knowledge_models(id) ON DELETE CASCADE,
 job_id text REFERENCES knowledge_extraction_jobs(id) ON DELETE SET NULL, item_key text NOT NULL, payload_hash text NOT NULL, payload jsonb NOT NULL,
 action text NOT NULL DEFAULT 'add', status text NOT NULL DEFAULT 'pending', target_asset_id text, target_revision text,
 reviewed_by text, reviewed_at timestamptz, review_note text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX idx_candidates_model_status ON knowledge_candidates(organization_id, knowledge_model_id, status);
--> statement-breakpoint
CREATE TABLE knowledge_business_rules (
 id text PRIMARY KEY, organization_id text NOT NULL, knowledge_model_id text NOT NULL REFERENCES knowledge_models(id) ON DELETE CASCADE,
 payload jsonb NOT NULL, status text NOT NULL DEFAULT 'active', revision integer NOT NULL DEFAULT 1, updated_by text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX idx_business_rules_model ON knowledge_business_rules(organization_id, knowledge_model_id);
--> statement-breakpoint
CREATE TABLE knowledge_evidence (
 id text PRIMARY KEY, organization_id text NOT NULL, knowledge_model_id text NOT NULL REFERENCES knowledge_models(id) ON DELETE CASCADE,
 candidate_id text NOT NULL REFERENCES knowledge_candidates(id) ON DELETE CASCADE, asset_type text, asset_id text,
 source_id text REFERENCES knowledge_sources(id) ON DELETE SET NULL, original_source_id text NOT NULL, source_hash text NOT NULL,
 source_title text NOT NULL, source_url text, quote text NOT NULL, state text NOT NULL DEFAULT 'current', created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX idx_evidence_asset ON knowledge_evidence(knowledge_model_id, asset_type, asset_id);
--> statement-breakpoint
CREATE INDEX idx_evidence_source ON knowledge_evidence(original_source_id);
