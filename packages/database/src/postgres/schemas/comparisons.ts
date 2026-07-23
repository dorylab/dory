import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import type { ComparisonRunArtifactRef } from '@dory/artifacts';
import type { ComparisonEndpoint, SchemaComparisonObjectType, SchemaComparisonSummary, SchemaDialectFamily, SchemaSnapshotCoverage } from '@dory/schema-compare';
import { newEntityId } from '@dory/shared/id';

export type ComparisonRunStatus = 'running' | 'success' | 'failed';
export type ComparisonAiReviewStatus = 'pending' | 'running' | 'success' | 'failed' | 'unavailable' | 'not_needed';
export type ComparisonRunActorType = 'user' | 'agent' | 'mcp' | 'automation';

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

export type ComparisonEndpointConfiguration = Omit<ComparisonEndpoint, 'schemas'>;

export type ComparisonConfigurationSnapshot = {
    version: 1;
    configurationVersion: number;
    name: string;
    source: ComparisonEndpointConfiguration;
    target: ComparisonEndpointConfiguration;
    schemaFilter: string[];
    objectTypes: SchemaComparisonObjectType[];
    dialectFamily: SchemaDialectFamily;
};

export const comparisons = pgTable(
    'comparisons',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => `cmp_${newEntityId()}`),
        organizationId: text('organization_id').notNull(),
        createdByUserId: text('created_by_user_id').notNull(),
        name: text('name').notNull(),
        kind: text('kind').$type<'schema'>().notNull().default('schema'),
        sourceEndpoint: jsonb('source_endpoint').$type<ComparisonEndpointConfiguration>().notNull(),
        targetEndpoint: jsonb('target_endpoint').$type<ComparisonEndpointConfiguration>().notNull(),
        schemaFilter: jsonb('schema_filter').$type<string[]>().notNull().default([]),
        objectTypes: jsonb('object_types').$type<SchemaComparisonObjectType[]>().notNull().default([]),
        dialectFamily: text('dialect_family').$type<SchemaDialectFamily>().notNull(),
        configurationVersion: integer('configuration_version').notNull().default(1),
        latestRunId: text('latest_run_id'),
        latestSuccessfulRunId: text('latest_successful_run_id'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [index('idx_comparisons_org_updated').on(table.organizationId, table.updatedAt)],
);

export const comparisonRuns = pgTable(
    'comparison_runs',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => `cmprun_${newEntityId()}`),
        organizationId: text('organization_id').notNull(),
        comparisonId: text('comparison_id').notNull(),
        createdByUserId: text('created_by_user_id').notNull(),
        actorType: text('actor_type').$type<ComparisonRunActorType>().notNull().default('user'),
        workId: text('work_id'),
        status: text('status').$type<ComparisonRunStatus>().notNull().default('running'),
        configurationSnapshot: jsonb('configuration_snapshot').$type<ComparisonConfigurationSnapshot>().notNull(),
        coverage: jsonb('coverage').$type<SchemaSnapshotCoverage>(),
        summary: jsonb('summary').$type<SchemaComparisonSummary>(),
        sourceSnapshotHash: text('source_snapshot_hash'),
        targetSnapshotHash: text('target_snapshot_hash'),
        artifactRef: jsonb('artifact_ref').$type<ComparisonRunArtifactRef>(),
        resultSetId: text('result_set_id'),
        aiReviewStatus: text('ai_review_status').$type<ComparisonAiReviewStatus>().notNull().default('pending'),
        aiReview: jsonb('ai_review').$type<ComparisonAiReview>(),
        aiReviewError: text('ai_review_error'),
        failureCode: text('failure_code'),
        failureMessage: text('failure_message'),
        startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        completedAt: timestamp('completed_at', { withTimezone: true }),
    },
    table => [
        index('idx_comparison_runs_comparison_started').on(table.comparisonId, table.startedAt),
        index('idx_comparison_runs_org_started').on(table.organizationId, table.startedAt),
        index('idx_comparison_runs_work_started').on(table.workId, table.startedAt),
        index('idx_comparison_runs_status_updated').on(table.status, table.updatedAt),
        uniqueIndex('uidx_comparison_runs_active')
            .on(table.comparisonId)
            .where(sql`${table.status} = 'running'`),
    ],
);

export type Comparison = typeof comparisons.$inferSelect;
export type NewComparison = typeof comparisons.$inferInsert;
export type ComparisonRun = typeof comparisonRuns.$inferSelect;
export type NewComparisonRun = typeof comparisonRuns.$inferInsert;
