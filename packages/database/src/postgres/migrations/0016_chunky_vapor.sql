CREATE TABLE "work_investigations" (
	"id" text PRIMARY KEY NOT NULL,
	"work_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"linked_tab_id" text,
	"last_query_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "works" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"title" text DEFAULT 'Untitled Work' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"goal" text NOT NULL,
	"conclusion" text,
	"connection_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_work_investigations_work_id" ON "work_investigations" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "idx_work_investigations_organization_work" ON "work_investigations" USING btree ("organization_id","work_id");--> statement-breakpoint
CREATE INDEX "idx_work_investigations_connection_id" ON "work_investigations" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "idx_works_organization_updated_at" ON "works" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_works_connection_id" ON "works" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "idx_works_created_by_user_id" ON "works" USING btree ("created_by_user_id");