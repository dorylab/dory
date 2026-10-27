ALTER TABLE "tabs" ADD COLUMN "naming_source" text DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tabs" ADD COLUMN "naming_request_id" text;
--> statement-breakpoint
ALTER TABLE "saved_queries" ADD COLUMN "naming_source" text DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE "saved_queries" ADD COLUMN "naming_request_id" text;
--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "naming_source" text DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "naming_request_id" text;
