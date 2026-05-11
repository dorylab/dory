ALTER TABLE "connections" ALTER COLUMN "host" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ALTER COLUMN "port" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN IF NOT EXISTS "path" text;
