ALTER TABLE "result_sets" ADD COLUMN "pinned_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "result_sets" ADD COLUMN "pinned_by_actor_id" text;
--> statement-breakpoint
ALTER TABLE "result_set_exports" ALTER COLUMN "expires_at" DROP NOT NULL;
