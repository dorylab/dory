CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "active_organization_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "logo" text;--> statement-breakpoint
UPDATE "session" AS s
SET "active_organization_id" = u."default_team_id"
FROM "user" AS u
WHERE s."user_id" = u."id"
  AND s."active_organization_id" IS NULL
  AND u."default_team_id" IS NOT NULL;--> statement-breakpoint
UPDATE "organizations"
SET "slug" = "id"
WHERE "slug" IS NULL OR "slug" = '';--> statement-breakpoint
CREATE INDEX "idx_invitation_organization_id" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_invitation_email" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_invitation_status" ON "invitation" USING btree ("status");
