import { bigint, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { newEntityId } from '@dory/shared/id';

export const ARTIFACT_TYPES = ['result_set', 'chart', 'file'] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];
export type ArtifactStatus = 'ready' | 'unavailable';

export type ArtifactChartState = {
    chartType: 'bar' | 'line' | 'pie' | 'scatter' | 'histogram' | 'heatmap';
    xKey: string;
    yKey: string;
    groupKey: string;
    chartColorPreset?: 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate';
};

export const artifacts = pgTable(
    'artifacts',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => `art_${newEntityId()}`),
        organizationId: text('organization_id').notNull(),
        type: text('type').$type<ArtifactType>().notNull(),
        title: text('title').notNull(),
        status: text('status').$type<ArtifactStatus>().notNull().default('ready'),
        resourceId: text('resource_id').notNull(),
        parentArtifactId: text('parent_artifact_id'),
        sourceResultSetId: text('source_result_set_id'),
        connectionId: text('connection_id'),
        workId: text('work_id'),
        agentRunId: text('agent_run_id'),
        comparisonId: text('comparison_id'),
        comparisonRunId: text('comparison_run_id'),
        sourceType: text('source_type'),
        createdByActorType: text('created_by_actor_type').notNull(),
        createdByActorId: text('created_by_actor_id'),
        chartState: jsonb('chart_state').$type<ArtifactChartState | null>(),
        fileName: text('file_name'),
        fileFormat: text('file_format').$type<'csv' | 'parquet' | null>(),
        byteSize: bigint('byte_size', { mode: 'number' }),
        expiresAt: timestamp('expires_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [
        uniqueIndex('uidx_artifacts_org_resource').on(table.organizationId, table.type, table.resourceId),
        index('idx_artifacts_org_created').on(table.organizationId, table.createdAt),
        index('idx_artifacts_org_type_created').on(table.organizationId, table.type, table.createdAt),
        index('idx_artifacts_source_result_set').on(table.organizationId, table.sourceResultSetId),
        index('idx_artifacts_expires_at').on(table.expiresAt),
    ],
);

export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
