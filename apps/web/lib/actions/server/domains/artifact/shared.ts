import { z } from 'zod';

export const artifactTypeSchema = z.enum(['result_set', 'chart', 'file']);
export const artifactChartStateSchema = z.object({
    chartType: z.enum(['bar', 'line', 'pie', 'scatter', 'histogram', 'heatmap']),
    xKey: z.string(),
    yKey: z.string(),
    groupKey: z.string(),
    chartColorPreset: z.enum(['blue', 'emerald', 'amber', 'rose', 'violet', 'slate']).optional(),
});

const dateSchema = z.union([z.date(), z.string()]);
const artifactWorkspaceTargetSchema = z.discriminatedUnion('mode', [
    z.object({
        mode: z.literal('agent'),
        workId: z.string().min(1),
        connectionId: z.string().min(1),
        tabId: z.string().min(1),
        sessionId: z.string().min(1),
        setIndex: z.number().int().nonnegative(),
        sql: z.string().nullable(),
    }),
    z.object({
        mode: z.literal('sql'),
        workId: z.null(),
        connectionId: z.string().min(1),
        tabId: z.string().min(1),
        sessionId: z.string().min(1),
        setIndex: z.number().int().nonnegative(),
        sql: z.string().nullable(),
    }),
]);
const artifactSummarySchema = z.object({
    id: z.string(),
    type: artifactTypeSchema,
    title: z.string(),
    status: z.string(),
    resourceId: z.string(),
    parentArtifactId: z.string().nullable(),
    sourceResultSetId: z.string().nullable(),
    connectionId: z.string().nullable(),
    connectionName: z.string().nullable(),
    workId: z.string().nullable(),
    agentRunId: z.string().nullable(),
    runTitle: z.string().nullable(),
    comparisonId: z.string().nullable(),
    comparisonName: z.string().nullable(),
    sourceType: z.string().nullable(),
    createdByActorType: z.string(),
    createdByActorId: z.string().nullable(),
    rowCount: z.number().nullable(),
    byteSize: z.number().nullable(),
    fileName: z.string().nullable(),
    fileFormat: z.enum(['csv', 'parquet']).nullable(),
    createdAt: dateSchema,
    updatedAt: dateSchema,
    expiresAt: dateSchema.nullable(),
    pinnedAt: dateSchema.nullable(),
    pinnedByActorId: z.string().nullable(),
    retentionDays: z.number().int().positive().nullable(),
});

export const artifactListOutputSchema = z.object({ rows: z.array(artifactSummarySchema), total: z.number().int().nonnegative() });
export const artifactDetailOutputSchema = artifactSummarySchema.extend({
    chartState: artifactChartStateSchema.nullable(),
    resultSet: z
        .object({
            id: z.string(),
            columns: z.array(z.unknown()),
            dataAvailability: z.string(),
            sql: z.string().nullable(),
            previewRowCount: z.number().int().nonnegative(),
        })
        .nullable(),
    workspaceTarget: artifactWorkspaceTargetSchema.nullable(),
    downloadUrl: z.string().nullable(),
});

export const artifactMutationOutputSchema = z.object({ id: z.string(), title: z.string() });
