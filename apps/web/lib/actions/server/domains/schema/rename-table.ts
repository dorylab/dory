import { z } from 'zod';
import { ensureConnectionPoolForUser } from '@/lib/connection/utils';
import { defineWebAction } from '../../define-web-action';
import { resolveConnectionId } from '../../operation-context';
import { updateConnection } from '../../policies';

const renameTableOutputSchema = z.object({
    ok: z.literal(true),
});

export const schemaRenameTableAction = defineWebAction({
    id: 'schema.renameTable',
    domain: 'schema',
    kind: 'command',
    risk: 'write',
    inputSchema: z.object({
        connectionId: z.string().min(1).optional(),
        database: z.string().min(1),
        table: z.string().min(1),
        nextName: z.string().min(1),
        identityId: z.string().min(1).optional(),
    }),
    outputSchema: renameTableOutputSchema,
    permissions: updateConnection,
    scopes: ['connections:write'],
    actors: ['user', 'automation'],
    requiresConfirmation: false,
    audit: {
        sourceByActor: {
            user: 'dory_schema_metadata',
            automation: 'automation_schema_metadata',
        },
        allowInputFields: ['connectionId', 'identityId', 'database', 'table'],
        inputSummary: input => ({
            connectionId: input.connectionId ?? null,
            identityId: input.identityId ?? null,
            database: input.database,
            table: input.table,
            nextNameLength: input.nextName.length,
        }),
        resource: (_ctx, input) => ({
            type: 'connection',
            id: input.connectionId ?? null,
            metadata: {
                database: input.database,
                table: input.table,
            },
        }),
    },
    handler: async (ctx, input) => {
        const connectionId = resolveConnectionId(ctx, input);
        const nextName = input.nextName.trim();
        if (!nextName || nextName.includes('.')) {
            throw new Error('New table name must be an unqualified table name.');
        }

        const { entry } = await ensureConnectionPoolForUser(ctx.userId, ctx.organizationId, connectionId, input.identityId ?? null);
        await entry.instance.renameTable(input.database, input.table, nextName);
        return { ok: true as const };
    },
});
