import { tool } from 'ai';
import { z } from 'zod';

import { translateApi } from '@/app/api/utils/i18n';
import type { Locale } from '@dory/i18n/routing';
import {
    buildChartProfileOperation,
    buildResultContextOperation,
    getDatabaseSummaryOperation,
    getMonitoringSummaryOperation,
    getSavedQueryOperation,
    getTableProfileOperation,
    listConnectionsOperation,
    listDatabasesOperation,
    listSavedQueriesOperation,
    listTablesOperation,
    previewTableOperation,
    runAnalysisOperation,
    searchSchemaOperation,
    describeTableOperation,
    type DoryToolOperationContext,
} from '@/lib/ai/tools/dory-tool-operations';

type CreateDoryChatToolsOptions = {
    userId: string;
    organizationId: string;
    currentConnectionId?: string | null;
    locale?: Locale;
};

const monitoringFiltersSchema = z
    .object({
        search: z.string().optional(),
        user: z.string().min(1).optional(),
        database: z.string().min(1).optional(),
        queryType: z.enum(['all', 'select', 'insert', 'ddl', 'other']).optional(),
        minDurationMs: z.number().min(0).optional(),
        timeRange: z.enum(['1h', '6h', '24h', '7d']).optional(),
    })
    .optional();

function optionalConnectionIdSchema() {
    return z.string().min(1).optional();
}

function toChatToolResult<T extends Record<string, unknown>>(value: T) {
    return {
        ok: true,
        ...value,
    };
}

function toChatToolError(error: unknown) {
    const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
    return {
        ok: false,
        error: {
            code: typeof record.code === 'string' ? record.code : 'TOOL_EXECUTION_FAILED',
            message: error instanceof Error ? error.message : String(error ?? 'Tool execution failed'),
        },
    };
}

function createOperationContext(options: CreateDoryChatToolsOptions): DoryToolOperationContext {
    return {
        organizationId: options.organizationId,
        userId: options.userId,
        currentConnectionId: options.currentConnectionId ?? null,
        locale: options.locale,
        restrictToCurrentConnection: true,
    };
}

async function executeChatTool<T extends Record<string, unknown>>(operation: () => Promise<T> | T) {
    try {
        return toChatToolResult(await operation());
    } catch (error) {
        return toChatToolError(error);
    }
}

export function createDoryChatTools(options: CreateDoryChatToolsOptions) {
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, options.locale);
    const context = createOperationContext(options);

    return {
        listConnections: tool({
            description: t('Api.Chat.Tools.ListConnections.Description'),
            inputSchema: z.object({}),
            execute: async () => executeChatTool(() => listConnectionsOperation(context)),
        }),
        listDatabases: tool({
            description: t('Api.Chat.Tools.ListDatabases.Description'),
            inputSchema: z.object({
                connectionId: optionalConnectionIdSchema(),
                identityId: z.string().min(1).optional(),
            }),
            execute: async input => executeChatTool(() => listDatabasesOperation(context, input)),
        }),
        listTables: tool({
            description: t('Api.Chat.Tools.ListTables.Description'),
            inputSchema: z.object({
                connectionId: optionalConnectionIdSchema(),
                database: z.string().min(1),
                identityId: z.string().min(1).optional(),
            }),
            execute: async input => executeChatTool(() => listTablesOperation(context, input)),
        }),
        describeTable: tool({
            description: t('Api.Chat.Tools.DescribeTable.Description'),
            inputSchema: z.object({
                connectionId: optionalConnectionIdSchema(),
                database: z.string().min(1),
                table: z.string().min(1),
                identityId: z.string().min(1).optional(),
            }),
            execute: async input => executeChatTool(() => describeTableOperation(context, input)),
        }),
        getDatabaseSummary: tool({
            description: t('Api.Chat.Tools.GetDatabaseSummary.Description'),
            inputSchema: z.object({
                connectionId: optionalConnectionIdSchema(),
                database: z.string().min(1),
                catalog: z.string().min(1).optional(),
                schema: z.string().min(1).optional(),
                identityId: z.string().min(1).optional(),
            }),
            execute: async input => executeChatTool(() => getDatabaseSummaryOperation(context, input)),
        }),
        getTableProfile: tool({
            description: t('Api.Chat.Tools.GetTableProfile.Description'),
            inputSchema: z.object({
                connectionId: optionalConnectionIdSchema(),
                database: z.string().min(1),
                table: z.string().min(1),
                identityId: z.string().min(1).optional(),
            }),
            execute: async input => executeChatTool(() => getTableProfileOperation(context, input)),
        }),
        searchSchema: tool({
            description: t('Api.Chat.Tools.SearchSchema.Description'),
            inputSchema: z.object({
                connectionId: optionalConnectionIdSchema(),
                query: z.string(),
                database: z.string().min(1).optional(),
                limit: z.number().int().positive().max(100).optional(),
                includeColumns: z.boolean().optional(),
                identityId: z.string().min(1).optional(),
            }),
            execute: async input => executeChatTool(() => searchSchemaOperation(context, input)),
        }),
        listSavedQueries: tool({
            description: t('Api.Chat.Tools.ListSavedQueries.Description'),
            inputSchema: z.object({
                connectionId: optionalConnectionIdSchema(),
                limit: z.number().int().positive().max(100).optional(),
                includeArchived: z.boolean().optional(),
            }),
            execute: async input => executeChatTool(() => listSavedQueriesOperation(context, input)),
        }),
        getSavedQuery: tool({
            description: t('Api.Chat.Tools.GetSavedQuery.Description'),
            inputSchema: z.object({
                connectionId: optionalConnectionIdSchema(),
                id: z.string().min(1),
                includeArchived: z.boolean().optional(),
            }),
            execute: async input => executeChatTool(() => getSavedQueryOperation(context, input)),
        }),
        getMonitoringSummary: tool({
            description: t('Api.Chat.Tools.GetMonitoringSummary.Description'),
            inputSchema: z.object({
                connectionId: optionalConnectionIdSchema(),
                filters: monitoringFiltersSchema,
                includeTimeline: z.boolean().optional(),
                includeSlowQueries: z.boolean().optional(),
                includeErrorQueries: z.boolean().optional(),
                pageSize: z.number().int().positive().max(100).optional(),
                identityId: z.string().min(1).optional(),
            }),
            execute: async input => executeChatTool(() => getMonitoringSummaryOperation(context, input)),
        }),
        previewTable: tool({
            description: t('Api.Chat.Tools.PreviewTable.Description'),
            inputSchema: z.object({
                connectionId: optionalConnectionIdSchema(),
                database: z.string().min(1),
                table: z.string().min(1),
                limit: z.number().int().positive().max(100).optional(),
                offset: z.number().int().min(0).optional(),
                identityId: z.string().min(1).optional(),
            }),
            execute: async input => executeChatTool(() => previewTableOperation(context, { ...input, source: 'chat-table-preview' })),
        }),
        buildResultContext: tool({
            description: t('Api.Chat.Tools.BuildResultContext.Description'),
            inputSchema: z.object({
                sessionId: z.string().min(1),
                setIndex: z.number().int().min(0).default(0),
                sqlText: z.string().optional(),
                databaseName: z.string().nullable().optional(),
                rowCount: z.number().int().min(0).optional(),
                columns: z.array(z.record(z.string(), z.unknown())).optional(),
                stats: z.record(z.string(), z.unknown()).nullable().optional(),
            }),
            execute: async input => executeChatTool(() => buildResultContextOperation(input)),
        }),
        buildChartProfile: tool({
            description: t('Api.Chat.Tools.BuildChartProfile.Description'),
            inputSchema: z.object({
                rows: z.array(z.record(z.string(), z.unknown())),
                columns: z.unknown().optional(),
                stats: z.record(z.string(), z.unknown()).nullable().optional(),
                overrides: z.record(z.string(), z.unknown()).optional(),
            }),
            execute: async input => executeChatTool(() => buildChartProfileOperation(input)),
        }),
        runAnalysis: tool({
            description: t('Api.Chat.Tools.RunAnalysis.Description'),
            inputSchema: z.object({
                connectionId: optionalConnectionIdSchema(),
                databaseName: z.string().nullable().optional(),
                resultRef: z.object({
                    sessionId: z.string().min(1),
                    setIndex: z.number().int().min(0),
                }),
                resultContext: z.record(z.string(), z.unknown()),
                insight: z.record(z.string(), z.unknown()),
                trigger: z.record(z.string(), z.unknown()),
                tabId: z.string().min(1).optional(),
                identityId: z.string().min(1).optional(),
            }),
            execute: async input => executeChatTool(() => runAnalysisOperation(context, input)),
        }),
    };
}
