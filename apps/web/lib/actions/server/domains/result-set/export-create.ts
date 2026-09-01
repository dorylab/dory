import { z } from 'zod';
import { ActionError } from '@dory/actions';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';

import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';
import { resultSetOperationsSchema } from './schemas';

const inputSchema = z.object({
    resultSetId: z.string().min(1),
    format: z.enum(['csv', 'parquet']),
    ...resultSetOperationsSchema,
});

const outputSchema = z.object({
    artifactId: z.string(),
    exportId: z.string(),
    format: z.enum(['csv', 'parquet']),
    fileName: z.string(),
    byteSize: z.number().optional(),
    downloadUrl: z.string(),
});

export const resultSetExportCreateAction = defineWebAction({
    id: 'resultSet.export.create',
    domain: 'resultSet',
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
        allowInputFields: ['resultSetId', 'format', 'sorts', 'filters', 'search'],
        inputSummary: input => ({
            resultSetId: input.resultSetId,
            format: input.format,
            sorts: input.sorts?.length ?? 0,
            filters: input.filters?.length ?? 0,
            search: input.search?.text ? true : undefined,
        }),
        resource: (_ctx, input) => ({
            type: 'resultSet',
            id: input.resultSetId,
        }),
        outputSummary: output => ({
            exportId: output.exportId,
            byteSize: output.byteSize,
        }),
    },
    handler: async (ctx, input) => {
        try {
            return await ctx.services.db.resultSets.createExport({
                organizationId: ctx.organizationId,
                resultSetId: input.resultSetId,
                format: input.format,
                sorts: input.sorts,
                filters: input.filters,
                search: input.search,
            });
        } catch (error) {
            if (error instanceof DatabaseError && error.code === 413) {
                throw new ActionError('ACTION_EXECUTION_FAILED', error.message, {
                    status: 413,
                    details: { code: 'WORKSPACE_STORAGE_QUOTA_EXCEEDED' },
                    cause: error,
                });
            }
            throw error;
        }
    },
});
