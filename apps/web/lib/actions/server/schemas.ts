import { z } from 'zod';
import type { QuerySource, QueryStatus } from '@dory/shared/types/audit';

export const querySources: QuerySource[] = [
    'console',
    'chatbot',
    'api',
    'task',
    'user_sql_console',
    'user_table_preview',
    'dory_schema_metadata',
    'dory_monitoring',
    'ai_sql_runner',
    'ai_table_preview',
    'ai_schema_metadata',
    'ai_analysis',
    'automation_sql',
    'automation_ai_sql',
    'automation_schema_metadata',
    'mcp_sql_runner',
    'mcp_table_preview',
    'mcp_schema_metadata',
    'mcp_monitoring',
    'mcp_analysis',
];
export const queryStatuses: QueryStatus[] = ['success', 'error', 'denied', 'canceled'];

export const connectionIdInput = z.object({
    connectionId: z.string().min(1).optional(),
    identityId: z.string().min(1).optional(),
});

export const unknownOutputSchema = z.unknown();
export const connectionListOutputSchema = z.object({
    connections: z.array(z.unknown()),
});
export const connectionListToolOutputSchema = z.object({
    connections: z.array(
        z.object({
            id: z.string(),
            name: z.string().nullable().optional(),
            type: z.string().nullable().optional(),
            engine: z.string().nullable().optional(),
            database: z.string().nullable().optional(),
            status: z.string().nullable().optional(),
            environment: z.string().nullable().optional(),
            lastCheckStatus: z.string().nullable().optional(),
            identities: z.array(
                z.object({
                    id: z.string(),
                    name: z.string().nullable().optional(),
                    username: z.string().nullable().optional(),
                    isDefault: z.boolean(),
                    database: z.string().nullable().optional(),
                }),
            ),
        }),
    ),
});
export const queryExecutionOutputSchema = z
    .object({
        session: z.record(z.string(), z.unknown()),
        queryResultSets: z.array(z.unknown()),
        results: z.array(z.unknown()),
        meta: z.record(z.string(), z.unknown()),
    })
    .passthrough();
