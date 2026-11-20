ALTER TABLE knowledge_connectors ADD COLUMN display_name text, ADD COLUMN synced_folders jsonb, ADD COLUMN drive_folder_id text, ADD COLUMN drive_refresh_token_encrypted text;
--> statement-breakpoint
ALTER TABLE knowledge_connector_items ADD COLUMN remote_title text, ADD COLUMN folder_trail jsonb;
--> statement-breakpoint
CREATE TABLE knowledge_drive_authorizations (
    id text PRIMARY KEY,
    state text UNIQUE,
    organization_id text NOT NULL,
    knowledge_model_id text NOT NULL REFERENCES knowledge_models(id) ON DELETE CASCADE,
    user_id text NOT NULL,
    verifier text NOT NULL,
    refresh_token_encrypted text,
    expires_at timestamptz NOT NULL
);
