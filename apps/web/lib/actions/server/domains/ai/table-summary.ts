import { z } from 'zod';

import type { ColumnInput } from '@dory/shared';
import type { TablePropertiesRow } from '@dory/shared/types/table-info';
import { buildFallbackDetail, buildFallbackHighlights, buildFallbackSnippets, buildFallbackSummary } from '@/lib/ai/core/table-summary';
import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';
import { columnInputSchema, type AiActionContext } from './shared';

type TableSummaryInput = {
    connectionId?: string | null;
    database?: string | null;
    table?: string | null;
    columns?: ColumnInput[];
    properties?: TablePropertiesRow | null;
    model?: string | null;
    catalog?: string | null;
    dbType?: string | null;
    ignoreCache?: boolean;
};

type TableSummarySource = 'cache' | 'ai' | 'fallback';

function buildFallbackTableSummary(input: TableSummaryInput, locale?: string | null) {
    const columns = Array.isArray(input.columns) ? input.columns : [];
    return {
        summary: buildFallbackSummary({ database: input.database, table: input.table, columns, properties: input.properties ?? null, locale }),
        detail: buildFallbackDetail({ database: input.database, table: input.table, columns, properties: input.properties ?? null, locale }),
        highlights: buildFallbackHighlights(columns, locale),
        snippets: buildFallbackSnippets(input.table, columns, locale),
        fromCache: false as const,
        source: 'fallback' as TableSummarySource,
    };
}

async function runTableSummaryAction(ctx: AiActionContext, input: TableSummaryInput) {
    const columns = Array.isArray(input.columns) ? input.columns : [];
    const connectionId = input.connectionId?.trim() || ctx.currentConnectionId?.trim();
    const fallback = buildFallbackTableSummary({ ...input, columns }, ctx.locale);

    if (!columns.length || !connectionId) {
        return fallback;
    }

    try {
        const provider = (await import('@/lib/ai/provider')).default;
        const result = await provider.getTableSummaryWithCache({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            connectionId,
            columns,
            properties: input.properties ?? null,
            dbType: input.dbType ?? null,
            catalog: input.catalog ?? null,
            database: input.database ?? null,
            table: input.table ?? null,
            model: input.model ?? null,
            ignoreCache: Boolean(input.ignoreCache),
            locale: ctx.locale,
        });

        return {
            ...result,
            source: result.fromCache ? ('cache' as const) : ('ai' as const),
        };
    } catch (error) {
        console.error('[action/ai.tableSummary] failed:', error);
        return fallback;
    }
}

export const aiTableSummaryAction = defineWebAction({
    id: 'ai.tableSummary',
    domain: 'ai',
    kind: 'query',
    risk: 'low',
    inputSchema: z.object({
        connectionId: z.string().min(1).optional(),
        database: z.string().nullable().optional(),
        table: z.string().nullable().optional(),
        columns: z.array(columnInputSchema).optional(),
        properties: z.record(z.string(), z.unknown()).nullable().optional(),
        model: z.string().nullable().optional(),
        catalog: z.string().nullable().optional(),
        dbType: z.string().nullable().optional(),
        ignoreCache: z.boolean().optional(),
    }),
    outputSchema: unknownOutputSchema,
    permissions: readWorkspace,
    scopes: ['analysis:run'],
    actors: ['user', 'agent', 'automation'],
    handler: runTableSummaryAction,
});
