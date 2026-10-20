ALTER TABLE knowledge_connectors ALTER COLUMN installation_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE knowledge_connectors ALTER COLUMN repository_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE knowledge_connectors ALTER COLUMN repository_full_name DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE knowledge_connectors ALTER COLUMN default_branch DROP NOT NULL;
--> statement-breakpoint
CREATE TABLE knowledge_linear_authorizations (
    id text PRIMARY KEY NOT NULL,
    organization_id text NOT NULL,
    workspace_id text NOT NULL,
    workspace_name text NOT NULL,
    access_token_encrypted text NOT NULL,
    refresh_token_encrypted text NOT NULL,
    expires_at timestamptz NOT NULL,
    authorized_at timestamptz DEFAULT now() NOT NULL,
    status text DEFAULT 'active' NOT NULL,
    refresh_lease text,
    refresh_lease_until timestamptz,
    updated_at timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX uidx_knowledge_linear_authorizations_org_workspace ON knowledge_linear_authorizations (organization_id, workspace_id);
--> statement-breakpoint
CREATE TABLE knowledge_linear_oauth_states (
    state_hash text PRIMARY KEY NOT NULL,
    organization_id text NOT NULL,
    user_id text NOT NULL,
    knowledge_model_id text NOT NULL REFERENCES knowledge_models(id) ON DELETE CASCADE,
    return_path text NOT NULL,
    expected_workspace_id text,
    expires_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE TABLE knowledge_linear_deliveries (delivery_id text PRIMARY KEY NOT NULL, created_at timestamptz DEFAULT now() NOT NULL);
--> statement-breakpoint
ALTER TABLE knowledge_connectors ADD COLUMN authorization_id text REFERENCES knowledge_linear_authorizations(id),
    ADD COLUMN linear_workspace_id text, ADD COLUMN linear_workspace_name text,
    ADD COLUMN project_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    ADD COLUMN config_revision integer DEFAULT 0 NOT NULL,
    ADD COLUMN next_sync_at timestamptz DEFAULT now() NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX uidx_knowledge_connectors_model_linear_workspace ON knowledge_connectors (knowledge_model_id, provider, linear_workspace_id);
--> statement-breakpoint
ALTER TABLE knowledge_connector_items ADD COLUMN source_url text;
--> statement-breakpoint
ALTER TABLE knowledge_connector_sync_jobs ADD COLUMN lease_token text, ADD COLUMN available_at timestamptz DEFAULT now() NOT NULL;
