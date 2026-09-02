CREATE TABLE "findings" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL,
    "work_id" text NOT NULL,
    "title" text NOT NULL,
    "content" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_findings_org_work_created" ON "findings" USING btree ("organization_id", "work_id", "created_at");
--> statement-breakpoint
CREATE TABLE "finding_artifacts" (
    "finding_id" text NOT NULL,
    "artifact_id" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "pk_finding_artifacts" PRIMARY KEY("finding_id", "artifact_id")
);
--> statement-breakpoint
CREATE INDEX "idx_finding_artifacts_artifact" ON "finding_artifacts" USING btree ("artifact_id");
