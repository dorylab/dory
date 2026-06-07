ALTER TABLE "work_investigations" DROP COLUMN "summary";
--> statement-breakpoint
CREATE TABLE "work_investigation_findings" (
    "id" text PRIMARY KEY NOT NULL,
    "work_id" text NOT NULL,
    "investigation_id" text NOT NULL,
    "organization_id" text NOT NULL,
    "content" text NOT NULL,
    "source_tab_id" text,
    "source_run_event_id" text,
    "created_by" text NOT NULL,
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_work_investigation_findings_work" ON "work_investigation_findings" USING btree ("organization_id","work_id");
--> statement-breakpoint
CREATE INDEX "idx_work_investigation_findings_investigation" ON "work_investigation_findings" USING btree ("organization_id","investigation_id");
--> statement-breakpoint
CREATE INDEX "idx_work_investigation_findings_source_tab" ON "work_investigation_findings" USING btree ("source_tab_id");
--> statement-breakpoint
CREATE INDEX "idx_work_investigation_findings_source_event" ON "work_investigation_findings" USING btree ("source_run_event_id");
