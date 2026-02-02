ALTER TABLE "saved_queries" ADD COLUMN "connection_id" text;--> statement-breakpoint
DROP TYPE "public"."datasource_status";--> statement-breakpoint
DROP TYPE "public"."datasource_type";