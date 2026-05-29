ALTER TABLE "query_audit" ADD COLUMN "identity_id" text;
--> statement-breakpoint
ALTER TABLE "query_audit" ADD COLUMN "identity_name" text;
--> statement-breakpoint
ALTER TABLE "query_audit" ADD COLUMN "identity_username" text;
--> statement-breakpoint
ALTER TABLE "query_audit" ADD COLUMN "identity_role" text;
--> statement-breakpoint
ALTER TABLE "query_audit" ADD COLUMN "identity_database" text;
