import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';

const inputSchema = z.object({
    sessionId: z.string().min(1),
});

const outputSchema = z.object({
    resultSets: z.array(
        z.object({
            sessionId: z.string(),
            setIndex: z.number(),
            sqlText: z.string(),
            sqlOp: z.string().nullable(),
            title: z.string().nullable(),
            columns: z.array(z.unknown()),
            stats: z.unknown().nullable(),
            viewState: z.unknown().nullable(),
            aiProfileVersion: z.number().nullable(),
            rowCount: z.number().nullable(),
            limited: z.boolean(),
            limit: z.number().nullable(),
            resultSetId: z.string(),
            dataAvailability: z.string(),
            previewRowCount: z.number().nullable(),
            affectedRows: z.number().nullable(),
            status: z.string(),
            errorMessage: z.string().nullable(),
            errorCode: z.string().nullable(),
            errorSqlState: z.string().nullable(),
            errorMeta: z.unknown().nullable(),
            warnings: z.unknown().nullable(),
            startedAt: z.number().nullable(),
            finishedAt: z.number().nullable(),
            durationMs: z.number().nullable(),
            byteSize: z.number().nullable(),
            artifactStore: z.string().nullable(),
            storageFormat: z.enum(['parquet', 'json']).nullable(),
            sourceConnectionType: z.string().nullable(),
            sourceDatabaseName: z.string().nullable(),
            createdAt: z.number().nullable(),
            expiresAt: z.number().nullable(),
        }),
    ),
});

export const queryResultSetsListAction = defineWebAction({
    id: 'query.resultSets.list',
    domain: 'query',
    kind: 'query',
    risk: 'read',
    inputSchema,
    outputSchema,
    permissions: readWorkspace,
    scopes: ['query:read'],
    actors: ['user', 'automation'],
    audit: {
        sourceByActor: {
            user: 'user_sql_console',
            automation: 'automation_sql',
        },
        allowInputFields: ['sessionId'],
        resource: (_ctx, input) => ({
            type: 'querySession',
            id: input.sessionId,
        }),
    },
    handler: async (ctx, input) => ({
        resultSets: await ctx.services.db.resultSets.listSessionResultSets({
            organizationId: ctx.organizationId,
            sessionId: input.sessionId,
        }),
    }),
});
