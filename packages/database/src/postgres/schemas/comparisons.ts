import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import type { ComparisonSnapshotArtifactRef } from '@dory/artifacts';
import type { ComparisonEndpoint, ComparisonKind, SchemaComparisonSummary, SchemaDialectFamily, SchemaSnapshotCoverage } from '@dory/schema-compare';
import { newEntityId } from '@dory/shared/id';

export type ComparisonStatus = 'running' | 'success' | 'failed';
export type ComparisonAiReviewStatus = 'pending' | 'running' | 'success' | 'failed' | 'unavailable';

export type ComparisonAiReview = {
    summary: string;
    deploymentNotes: string[];
    risks: Array<{
        changeId: string;
        explanation: string;
    }>;
    recommendations: string[];
    limitations: string[];
    generatedAt: string;
};

export const comparisonJobs = pgTable(
    'comparison_jobs',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => `cmp_${newEntityId()}`),
        organizationId: text('organization_id').notNull(),
        createdByUserId: text('created_by_user_id').notNull(),
        workId: text('work_id'),
        kind: text('kind').$type<ComparisonKind>().notNull().default('schema'),
        status: text('status').$type<ComparisonStatus>().notNull().default('running'),
        currentEndpoint: jsonb('current_endpoint').$type<ComparisonEndpoint>().notNull(),
        desiredEndpoint: jsonb('desired_endpoint').$type<ComparisonEndpoint>().notNull(),
        dialectFamily: text('dialect_family').$type<SchemaDialectFamily>().notNull(),
        coverage: jsonb('coverage').$type<SchemaSnapshotCoverage>(),
        summary: jsonb('summary').$type<SchemaComparisonSummary>(),
        currentSnapshotHash: text('current_snapshot_hash'),
        desiredSnapshotHash: text('desired_snapshot_hash'),
        snapshotArtifactRef: jsonb('snapshot_artifact_ref').$type<ComparisonSnapshotArtifactRef>(),
        resultSetId: text('result_set_id'),
        aiReviewStatus: text('ai_review_status').$type<ComparisonAiReviewStatus>().notNull().default('pending'),
        aiReview: jsonb('ai_review').$type<ComparisonAiReview>(),
        aiReviewError: text('ai_review_error'),
        previousComparisonId: text('previous_comparison_id'),
        failureCode: text('failure_code'),
        failureMessage: text('failure_message'),
        expiresAt: timestamp('expires_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        completedAt: timestamp('completed_at', { withTimezone: true }),
    },
    table => [
        index('idx_comparison_jobs_org_created').on(table.organizationId, table.createdAt),
        index('idx_comparison_jobs_work_created').on(table.workId, table.createdAt),
        index('idx_comparison_jobs_status_updated').on(table.status, table.updatedAt),
        index('idx_comparison_jobs_expires_at').on(table.expiresAt),
        index('idx_comparison_jobs_previous').on(table.previousComparisonId),
    ],
);

export type ComparisonJob = typeof comparisonJobs.$inferSelect;
export type NewComparisonJob = typeof comparisonJobs.$inferInsert;
