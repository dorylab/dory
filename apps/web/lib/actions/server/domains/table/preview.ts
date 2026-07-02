import { z } from 'zod';
import { previewTableOperation } from '@/lib/ai/tools/dory-tool-operations';
import { defineWebAction } from '../../define-web-action';
import { actionOperationContext, actorAuditSource } from '../../operation-context';
import { readConnection } from '../../policies';
import { unknownOutputSchema } from '../../schemas';

const tablePreviewSortSchema = z
    .object({
        column: z.string().min(1),
        direction: z.enum(['asc', 'desc']),
    })
    .nullable()
    .optional();

const tablePreviewFilterSchema = z.object({
    col: z.string().min(1),
    kind: z.enum(['string', 'number', 'range']),
    op: z.enum(['contains', 'equals', 'startsWith', 'endsWith', 'empty', 'notEmpty', 'regex', 'eq', 'ne', 'gt', 'ge', 'lt', 'le', 'range']),
    value: z.string().optional(),
    valueTo: z.string().optional(),
    rangeValueType: z.enum(['number', 'date']).optional(),
    caseSensitive: z.boolean().optional(),
});

export const tablePreviewAction = defineWebAction({
    id: 'table.preview',
    domain: 'table',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({
        connectionId: z.string().min(1).optional(),
        database: z.string().min(1),
        table: z.string().min(1),
        limit: z.number().int().positive().max(1000).optional(),
        offset: z.number().int().min(0).optional(),
        countMode: z.enum(['none', 'exact']).optional(),
        sort: tablePreviewSortSchema,
        filters: z.array(tablePreviewFilterSchema).max(20).optional(),
        search: z.string().max(200).nullable().optional(),
        searchColumns: z.array(z.string().min(1)).max(200).optional(),
        identityId: z.string().min(1).optional(),
    }),
    outputSchema: unknownOutputSchema,
    permissions: readConnection,
    scopes: ['query:read'],
    actors: ['user', 'agent', 'mcp', 'automation'],
    mcp: {
        name: 'dory_preview_table',
        title: 'Preview table',
        description: 'Preview rows from a table with a hard row limit.',
    },
    handler: (ctx, input) =>
        previewTableOperation(actionOperationContext(ctx, actorAuditSource(ctx, 'dory_schema_metadata')), {
            ...input,
            source: ctx.actor.type === 'mcp' ? 'mcp-table-preview' : ctx.actor.type === 'agent' ? 'chat-table-preview' : 'user-table-preview',
        }),
});
