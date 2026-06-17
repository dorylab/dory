import { z } from 'zod';

import { fallbackSummaries } from '@/lib/ai/core/schema-explanations';
import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { unknownOutputSchema } from '../../schemas';
import { columnInputSchema, type AiActionContext, type SchemaColumnsInput } from './shared';

async function runSchemaExplanationsAction(ctx: AiActionContext, input: SchemaColumnsInput) {
    const connectionId = input.connectionId?.trim() || ctx.currentConnectionId?.trim();
    if (!connectionId) {
        throw new Error('Missing connection context.');
    }

    try {
        const provider = (await import('@/lib/ai/provider')).default;
        return await provider.getColumnExplanationsWithCache({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            req: ctx.services.req,
            connectionId,
            columns: input.columns,
            dbType: input.dbType ?? null,
            catalog: input.catalog ?? null,
            database: input.database ?? null,
            table: input.table ?? null,
            model: input.model ?? null,
            locale: ctx.locale,
        });
    } catch (error) {
        console.error('[action/ai.schemaExplanations] failed:', error);
        return {
            columns: fallbackSummaries(input.columns, ctx.locale),
        };
    }
}

export const aiSchemaExplanationsAction = defineWebAction({
    id: 'ai.schemaExplanations',
    domain: 'ai',
    kind: 'query',
    risk: 'low',
    inputSchema: z.object({
        connectionId: z.string().min(1).optional(),
        columns: z.array(columnInputSchema).min(1),
        database: z.string().nullable().optional(),
        table: z.string().nullable().optional(),
        model: z.string().nullable().optional(),
        catalog: z.string().nullable().optional(),
        dbType: z.string().nullable().optional(),
    }),
    outputSchema: unknownOutputSchema,
    permissions: readWorkspace,
    scopes: ['analysis:run'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_generate_schema_explanations',
        title: 'Generate schema explanations',
        description: 'Generate concise explanations for database columns using Dory AI, with fallback summaries.',
    },
    handler: runSchemaExplanationsAction,
});
