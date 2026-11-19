CREATE TABLE knowledge_folders (
    id text PRIMARY KEY,
    knowledge_model_id text NOT NULL REFERENCES knowledge_models(id) ON DELETE CASCADE,
    parent_id text REFERENCES knowledge_folders(id),
    name text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX uidx_knowledge_folders_sibling ON knowledge_folders (knowledge_model_id, coalesce(parent_id, ''), name);
--> statement-breakpoint
ALTER TABLE knowledge_sources ADD COLUMN folder_id text REFERENCES knowledge_folders(id);
--> statement-breakpoint
DROP INDEX uidx_knowledge_sources_model_file;
--> statement-breakpoint
CREATE UNIQUE INDEX uidx_knowledge_sources_folder_file ON knowledge_sources (knowledge_model_id, coalesce(folder_id, ''), file_name);
--> statement-breakpoint
ALTER TABLE knowledge_connector_items ADD COLUMN project_id text, ADD COLUMN project_name text;
