ALTER TABLE "knowledge_models" ALTER COLUMN "model_yaml" SET DEFAULT E'version: 0.2.0.dev0\nname: untitled_model\ndatasets:\n  - name: untitled_dataset\n    source: __unconfigured__\nrelationships: []\nmetrics: []\n';
--> statement-breakpoint
ALTER TABLE "knowledge_models" ALTER COLUMN "model_json" SET DEFAULT '{"version":"0.2.0.dev0","name":"untitled_model","datasets":[{"name":"untitled_dataset","source":"__unconfigured__"}],"relationships":[],"metrics":[]}'::jsonb;
