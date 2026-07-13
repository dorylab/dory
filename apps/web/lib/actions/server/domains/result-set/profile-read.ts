import { z } from 'zod';

import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';

const inputSchema = z.object({
    resultSetId: z.string().min(1),
    sampleRows: z.number().int().positive().max(200).optional(),
});

const outputSchema = z.object({
    columns: z.array(z.unknown()),
    stats: z.unknown(),
    sampleRows: z.array(z.record(z.string(), z.unknown())),
});

export const resultSetProfileReadAction = defineWebAction({
    id: 'resultSet.profile.read',
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
        allowInputFields: ['resultSetId', 'sampleRows'],
    },
    handler: (ctx, input) =>
        ctx.services.db.resultSets.readProfile({
            organizationId: ctx.organizationId,
            resultSetId: input.resultSetId,
            sampleRows: input.sampleRows,
        }),
});
