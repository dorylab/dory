import { z } from 'zod';
import type { ActionContext, ActionDefinition, ActionId, ActionProjection } from '@dory/actions';
import { DEFAULT_ACTION_PROJECTION_BY_ACTOR, hasActionScope, toActionError } from '@dory/actions';
import { getDesktopProtocolSchemeForServer } from '@dory/shared/runtime';
import { getAgentRunSummary } from '@/lib/agent-runs/summary';
import { buildAgentWorkspacePath } from '@/lib/agent-runs/workspace-url';
import { executeAction } from '@/lib/actions/server/execute';
import { webActionRegistry } from '@/lib/actions/server/registry';
import type { WebActionServices } from '@/lib/actions/server/types';
import type { WorkSqlSnapshotPayload } from '@dory/database/postgres/impl/works';

const DEFAULT_APPEND_SEPARATOR = '\n\n';
const DEFAULT_WORK_TITLE = 'Agent Run';
const MAX_WORK_TITLE_LENGTH = 240;
const MAX_SHORT_WORK_TITLE_LENGTH = 64;
const WORK_CONTEXT_INSTRUCTION =
    'Call dory_create_work before query, schema exploration, schema comparison, SQL, workspace tab, or saved query tools, then pass the returned work.workId as workId.';

const workResolutionInputSchema = z.object({
    workId: z.string().min(1).optional(),
    externalSessionId: z.string().min(1).optional(),
});

const connectionListInputSchema = z
    .object({
        includeRecent: z.boolean().optional(),
    })
    .merge(workResolutionInputSchema);

const artifactReadInputSchema = z
    .object({
        artifactId: z.string().min(1),
        previewRows: z.number().int().positive().max(200).optional(),
    })
    .merge(workResolutionInputSchema);

const schemaExploreInputSchema = z
    .object({
        operation: z.enum(['search', 'list_databases', 'list_tables', 'describe_table', 'preview_table', 'table_profile', 'get_ddl']),
        connectionId: z.string().min(1),
        database: z.string().min(1).optional(),
        table: z.string().min(1).optional(),
        query: z.string().optional(),
        limit: z.number().int().positive().max(1000).optional(),
        offset: z.number().int().min(0).optional(),
        includeColumns: z.boolean().optional(),
        identityId: z.string().min(1).optional(),
        sort: z.unknown().optional(),
        filters: z.unknown().optional(),
        search: z.string().max(200).nullable().optional(),
        searchColumns: z.array(z.string().min(1)).max(200).optional(),
    })
    .merge(workResolutionInputSchema)
    .passthrough();

const schemaGraphInputSchema = z
    .object({
        connectionId: z.string().min(1),
        database: z.string().min(1),
        schemas: z.array(z.string().min(1)).max(100).optional(),
        focusTables: z
            .array(
                z.object({
                    schema: z.string().min(1).nullable().optional(),
                    name: z.string().min(1),
                }),
            )
            .max(100)
            .optional(),
        depth: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
        columnMode: z.enum(['all', 'keys']).optional(),
        identityId: z.string().min(1).optional(),
    })
    .merge(workResolutionInputSchema);

const comparisonEndpointInputSchema = z.object({
    connectionId: z.string().min(1),
    identityId: z.string().min(1).nullable().optional(),
    database: z.string().min(1),
    schemas: z.array(z.string().min(1)).max(100).optional(),
});

const compareSchemaInputSchema = z
    .object({
        comparisonId: z.string().min(1).optional(),
        name: z.string().trim().min(1).max(160).optional(),
        source: comparisonEndpointInputSchema.optional(),
        target: comparisonEndpointInputSchema.optional(),
        current: comparisonEndpointInputSchema.optional(),
        desired: comparisonEndpointInputSchema.optional(),
        schemaFilter: z.array(z.string().min(1)).max(100).optional(),
        objectTypes: z
            .array(z.enum(['table', 'column', 'index', 'constraint', 'view']))
            .min(1)
            .max(5)
            .optional(),
    })
    .merge(workResolutionInputSchema)
    .superRefine((value, context) => {
        if (value.comparisonId) return;
        if ((value.source ?? value.current) && (value.target ?? value.desired)) return;
        context.addIssue({
            code: 'custom',
            message: 'Provide comparisonId, or provide Source and Target endpoints to create a saved Comparison.',
        });
    });

const analyzeDatabaseChangesInputSchema = z
    .object({
        runId: z.string().min(1),
        deploymentContext: z.string().max(4000).nullable().optional(),
    })
    .merge(workResolutionInputSchema);

const readonlySqlInputSchema = z
    .object({
        connectionId: z.string().min(1),
        sql: z.string().min(1),
        reason: z.string().optional(),
        workspaceMode: z.enum(['none', 'create_tab', 'append_to_tab', 'replace_tab']).default('none'),
        targetTabId: z.string().min(1).optional(),
        tabName: z.string().min(1).optional(),
        appendSeparator: z.string().optional(),
        maxRows: z.number().int().positive().max(1000).optional(),
        database: z.string().optional().nullable(),
        identityId: z.string().min(1).optional(),
    })
    .merge(workResolutionInputSchema);

const workspaceTabsInputSchema = z
    .object({
        operation: z.enum(['list', 'create_sql', 'append_sql', 'replace_sql', 'delete', 'open_table']),
        connectionId: z.string().min(1),
        tabId: z.string().min(1).optional(),
        sql: z.string().optional(),
        tabName: z.string().min(1).optional(),
        databaseName: z.string().min(1).optional(),
        tableName: z.string().min(1).optional(),
        activeSubTab: z.enum(['overview', 'data', 'structure', 'indexes', 'stats']).optional(),
        appendSeparator: z.string().optional(),
    })
    .merge(workResolutionInputSchema)
    .passthrough();

const savedQueriesInputSchema = z
    .object({
        operation: z.enum(['list', 'get', 'create', 'update', 'delete']),
        connectionId: z.string().min(1),
        id: z.string().min(1).optional(),
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        folderId: z.string().nullable().optional(),
        sqlText: z.string().min(1).optional(),
        context: z.record(z.string(), z.unknown()).nullable().optional(),
        tags: z.array(z.string()).nullable().optional(),
        workId: z.string().nullable().optional(),
        patch: z.record(z.string(), z.unknown()).optional(),
        limit: z.number().int().positive().max(100).optional(),
        includeArchived: z.boolean().optional(),
    })
    .merge(workResolutionInputSchema)
    .passthrough();

const createWorkInputSchema = z
    .object({
        connectionId: z.string().min(1).optional(),
        externalSessionId: z.string().min(1).optional(),
        title: z
            .string()
            .min(1)
            .max(1000)
            .optional()
            .describe('Generate a short, human-readable Agent Run title from the user question. Do not paste the full question. Aim for 3-8 words or 16-32 CJK characters.'),
        userQuestion: z
            .string()
            .min(1)
            .max(4000)
            .optional()
            .describe('Original user question for this Codex task. Dory derives a short Agent Run title from it when title is omitted.'),
        question: z
            .string()
            .min(1)
            .max(4000)
            .optional()
            .describe('Original user question for this Codex task. Dory derives a short Agent Run title from it when title is omitted.'),
        prompt: z.string().min(1).max(4000).optional().describe('Original user prompt for this Codex task. Dory derives a short Agent Run title from it when title is omitted.'),
        metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    })
    .passthrough();

const finishWorkInputSchema = z
    .object({
        workId: z.string().min(1),
        status: z.enum(['active', 'completed', 'error']),
        summaryTitle: z.string().min(1).max(1000).optional(),
        findings: z.array(z.string().min(1).max(500)).min(1).max(20).describe('User-facing analytical conclusions from this Agent Run. These appear under Findings.'),
        steps: z.array(z.string().min(1).max(500)).min(1).max(20).describe('User-facing execution steps taken to complete this Agent Run. These appear under Steps.'),
    })
    .passthrough();

const actionTransportInputSchema = z
    .object({
        operation: z.enum(['list', 'describe', 'run']),
        actionId: z.string().min(1).optional(),
        input: z.unknown().optional(),
        projection: z.enum(['canonical', 'ui', 'agent', 'mcp', 'automation']).optional(),
        reason: z.string().nullable().optional(),
    })
    .passthrough();

type ActionTransportAccess = 'read' | 'write';
const MCP_CLIENT_APPROVED_CONFIRMATION_TOKEN = 'mcp-client-approved';

const mcpErrorShape = {
    ok: z.literal(false).optional(),
    error: z
        .object({
            code: z.unknown().optional(),
            message: z.string(),
            details: z.unknown().nullable().optional(),
        })
        .passthrough()
        .optional(),
};

const connectionListOutputSchema = z
    .object({
        connections: z
            .array(
                z.object({
                    connectionId: z.string(),
                    name: z.string().nullable().optional(),
                    type: z.string().nullable().optional(),
                    environment: z.string().nullable().optional(),
                    defaultDatabase: z.string().nullable().optional(),
                    lastUsedAt: z.string().nullable().optional(),
                    permissionsSummary: z.string().nullable().optional(),
                }),
            )
            .optional(),
        ...mcpErrorShape,
    })
    .passthrough();

const readonlySqlOutputSchema = z
    .object({
        result: z.array(z.record(z.string(), z.unknown())).optional(),
        columns: z.array(z.unknown()).optional(),
        rowCount: z.number().optional(),
        truncated: z.boolean().optional(),
        executionTimeMs: z.number().optional(),
        workspaceAction: z
            .object({
                mode: z.enum(['none', 'create_tab', 'append_to_tab', 'replace_tab']),
                tabId: z.string().optional(),
                tabName: z.string().optional(),
                status: z.enum(['created', 'updated', 'skipped']),
            })
            .optional(),
        ...mcpErrorShape,
    })
    .passthrough();

const unknownObjectOutputSchema = z.object({}).passthrough();

type ResolvedMcpWork = {
    workId: string;
    workspaceUrl: string;
    connectionId: string | null;
    externalSessionId: string | null;
};

type UnknownRecord = Record<string, unknown>;

type WorkspaceActionResult = {
    mode: 'none' | 'create_tab' | 'append_to_tab' | 'replace_tab';
    tabId?: string;
    tabName?: string;
    status: 'created' | 'updated' | 'skipped';
};

type ReadonlySqlExecutionOutput = WorkSqlSnapshotPayload & {
    session: WorkSqlSnapshotPayload['session'];
    queryResultSets: WorkSqlSnapshotPayload['queryResultSets'];
    results: WorkSqlSnapshotPayload['results'];
};

type McpStructuredError = Error & {
    code?: string;
    status?: number;
    details?: unknown;
};

type McpFacadeTool = {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodTypeAny;
    outputSchema: z.ZodTypeAny;
    annotations?: Record<string, unknown>;
    execute: (ctx: ActionContext<WebActionServices>, input: unknown) => Promise<unknown>;
};

class McpFacadeError extends Error {
    readonly code: string;
    readonly status: number;
    readonly details?: unknown;

    constructor(code: string, message: string, options: { status?: number; details?: unknown } = {}) {
        super(message);
        this.name = 'McpFacadeError';
        this.code = code;
        this.status = options.status ?? 400;
        this.details = options.details;
    }
}

function requireString(value: unknown, name: string): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${name} is required for this operation.`);
    }
    return value;
}

function isRecord(value: unknown): value is UnknownRecord {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toRecord(value: unknown): UnknownRecord {
    return isRecord(value) ? value : {};
}

function hasOrganizationPermission(ctx: ActionContext<WebActionServices>, action: ActionDefinition<any, any, WebActionServices>) {
    for (const requirement of action.permission.organization ?? []) {
        const resource = ctx.access.permissions[requirement.resource] as Record<string, boolean> | undefined;
        if (!ctx.access.isMember || !resource?.[requirement.action]) return false;
    }
    return true;
}

function hasRequiredScopes(ctx: ActionContext<WebActionServices>, action: ActionDefinition<any, any, WebActionServices>) {
    for (const scope of action.permission.scopes ?? []) {
        if (!hasActionScope(ctx.actor.scopes, scope, action.permission.scopeAliases)) return false;
    }
    return true;
}

function missingRequiredScopes(ctx: ActionContext<WebActionServices>, action: ActionDefinition<any, any, WebActionServices>) {
    return (action.permission.scopes ?? []).filter(scope => !hasActionScope(ctx.actor.scopes, scope, action.permission.scopeAliases));
}

function missingOrganizationPermissions(ctx: ActionContext<WebActionServices>, action: ActionDefinition<any, any, WebActionServices>) {
    return (action.permission.organization ?? []).filter(requirement => {
        const resource = ctx.access.permissions[requirement.resource] as Record<string, boolean> | undefined;
        return !ctx.access.isMember || !resource?.[requirement.action];
    });
}

function isReadAction(action: ActionDefinition<any, any, WebActionServices>) {
    return action.risk === 'read' || action.risk === 'low';
}

function isWriteAction(action: ActionDefinition<any, any, WebActionServices>) {
    return action.risk === 'write' || action.risk === 'destructive';
}

function isActionForTransport(action: ActionDefinition<any, any, WebActionServices>, access: ActionTransportAccess) {
    return access === 'read' ? isReadAction(action) : isWriteAction(action);
}

function actionRequiresConfirmation(action: ActionDefinition<any, any, WebActionServices>) {
    return action.permission.confirmation?.required ?? (action.risk === 'destructive' && action.permission.destructive?.requireConfirmation !== false) ?? false;
}

function isActionVisibleInMcpCatalog(ctx: ActionContext<WebActionServices>, action: ActionDefinition<any, any, WebActionServices>, access: ActionTransportAccess) {
    return action.exposure.actors.includes('mcp') && isActionForTransport(action, access) && hasRequiredScopes(ctx, action) && hasOrganizationPermission(ctx, action);
}

function isActionDescribableInMcpCatalog(action: ActionDefinition<any, any, WebActionServices>, access: ActionTransportAccess) {
    return action.exposure.actors.includes('mcp') && isActionForTransport(action, access);
}

function assertActionRunnableByMcp(action: ActionDefinition<any, any, WebActionServices>, access: ActionTransportAccess) {
    if (!action.exposure.actors.includes('mcp')) {
        throw new McpFacadeError('ACTION_NOT_AVAILABLE', `Action "${action.id}" is not available to MCP.`, { status: 403, details: { actionId: action.id } });
    }
    if (!isActionForTransport(action, access)) {
        throw new McpFacadeError('ACTION_NOT_AVAILABLE', `Action "${action.id}" is not available through dory_${access}.`, {
            status: 403,
            details: { actionId: action.id, access },
        });
    }
}

function actionSchemaToJsonSchema(schema: z.ZodTypeAny) {
    try {
        return z.toJSONSchema(schema);
    } catch {
        return null;
    }
}

function actionProjectionSchema(action: ActionDefinition<any, any, WebActionServices>, projection: ActionProjection = DEFAULT_ACTION_PROJECTION_BY_ACTOR.mcp) {
    return action.exposure.projections?.[projection]?.schema ?? action.outputSchema;
}

function actionMetadata(action: ActionDefinition<any, any, WebActionServices>, projection: ActionProjection = DEFAULT_ACTION_PROJECTION_BY_ACTOR.mcp) {
    return {
        id: action.id,
        version: action.version,
        domain: action.domain,
        kind: action.kind,
        risk: action.risk,
        effects: action.effects ?? [],
        actors: action.exposure.actors,
        defaultProjection: action.exposure.defaultProjection ?? {},
        scopes: action.permission.scopes ?? [],
        organizationPermissions: action.permission.organization ?? [],
        requiresConfirmation: action.permission.confirmation?.required ?? (action.risk === 'destructive' && action.permission.destructive?.requireConfirmation !== false) ?? false,
        inputSchema: actionSchemaToJsonSchema(action.inputSchema),
        outputSchema: actionSchemaToJsonSchema(actionProjectionSchema(action, projection)),
    };
}

function actionAvailability(ctx: ActionContext<WebActionServices>, action: ActionDefinition<any, any, WebActionServices>) {
    const missingScopes = missingRequiredScopes(ctx, action);
    const missingPermissions = missingOrganizationPermissions(ctx, action);
    return {
        runnable: action.exposure.actors.includes('mcp') && missingScopes.length === 0 && missingPermissions.length === 0,
        missingScopes,
        missingOrganizationPermissions: missingPermissions,
    };
}

function getString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

function getNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function ensureSqlStatementBoundary(sql: string) {
    const trimmed = sql.trimEnd();
    if (!trimmed || trimmed.endsWith(';')) return trimmed;

    const lastLine = trimmed.split(/\r?\n/).at(-1)?.trimStart() ?? '';
    return lastLine.startsWith('--') ? `${trimmed}\n;` : `${trimmed};`;
}

function appendSqlToTabContent(existingContent: unknown, sql: string, separator = DEFAULT_APPEND_SEPARATOR) {
    const existing = typeof existingContent === 'string' ? existingContent : '';
    const prefix = ensureSqlStatementBoundary(existing);
    const suffix = ensureSqlStatementBoundary(sql);
    if (!prefix) return suffix;

    return `${prefix}${separator}${suffix}`;
}

function cleanWorkTitleText(value: unknown) {
    return typeof value === 'string'
        ? value
              .replace(/\s+/g, ' ')
              .replace(/^[`"'\s]+|[`"'\s]+$/g, '')
              .trim()
        : '';
}

function trimWorkTitle(value: string, maxLength = MAX_SHORT_WORK_TITLE_LENGTH) {
    const title = value.replace(/\s+/g, ' ').trim();
    if (title.length <= maxLength) return title;

    const boundary = title.slice(0, maxLength).search(/[\s,，.。:：;；!?！？][^,\s，.。:：;；!?！？]*$/);
    const trimmed = boundary > Math.floor(maxLength * 0.55) ? title.slice(0, boundary) : title.slice(0, maxLength - 3);
    return `${trimmed.trim()}...`;
}

function deriveWorkTitleFromQuestion(value: string) {
    const original = cleanWorkTitleText(value);
    let title = original
        .replace(/^请(?:帮我|帮忙)?\s*/i, '')
        .replace(/^帮我\s*/i, '')
        .replace(/^使用\s*dory\s*(?:来|去)?(?:查询|分析|查看)?\s*/i, '')
        .replace(/^查询\s*[^，,。；;：:]*?(?:数据库|database)\s*[，,。；;：:]?\s*/i, '')
        .replace(/^[\w.-]+\s*(?:数据库|database)\s*[，,。；;：:]?\s*/i, '')
        .replace(/^分析\s*/i, '')
        .replace(/^(?:please\s+)?(?:use\s+dory\s+(?:to\s+)?)?/i, '')
        .replace(/^(?:please\s+)?(?:help\s+me\s+)?(?:analyze|analyse|query|summarize|summarise|inspect)\s+/i, '')
        .replace(/^(?:query|analyze|analyse|inspect|check)\s+[\w.-]+\s+database\s+(?:and\s+)?/i, '')
        .replace(/^(?:from|in|against)\s+[\w.-]+\s+database\s+(?:and\s+)?/i, '')
        .trim();

    if (!title) title = original;
    return trimWorkTitle(title);
}

function normalizeWorkTitle(input: UnknownRecord) {
    const candidates = [input.title, input.userQuestion, input.question, input.prompt];
    const candidate = candidates.map(cleanWorkTitleText).find(Boolean);
    const title = candidate ? deriveWorkTitleFromQuestion(candidate) : null;
    if (!title) return null;
    return title.length > MAX_WORK_TITLE_LENGTH ? `${title.slice(0, MAX_WORK_TITLE_LENGTH - 3)}...` : title;
}

function firstResultSet(output: ReadonlySqlExecutionOutput) {
    const firstRows = Array.isArray(output.results[0]) ? output.results[0] : [];
    const firstSet = toRecord(output.queryResultSets[0]);
    return {
        rows: firstRows as Array<Record<string, unknown>>,
        columns: Array.isArray(firstSet.columns) ? firstSet.columns : [],
        rowCount: getNumber(firstSet.rowCount) ?? firstRows.length,
        truncated: Boolean(firstSet.limited),
        executionTimeMs: getNumber(firstSet.durationMs) ?? 0,
    };
}

async function executeInternal<T = unknown>(ctx: ActionContext<WebActionServices>, actionId: Parameters<typeof executeAction>[1], input: unknown): Promise<T> {
    const { data } = await executeAction<T>(ctx, actionId, input);
    return data;
}

function buildWorkspaceUrl(
    ctx: ActionContext<WebActionServices>,
    work: { workId: string; connectionId?: string | null },
    options: { tabId?: string | null; sessionId?: string | null } = {},
) {
    const path = buildAgentWorkspacePath({
        organization: ctx.organizationId,
        workId: work.workId,
        connectionId: work.connectionId ?? null,
        tabId: options.tabId,
        sessionId: options.sessionId,
    });
    if (ctx.runtime === 'desktop') {
        const url = new URL(`${getDesktopProtocolSchemeForServer()}://open`);
        url.searchParams.set('path', path);
        return url.toString();
    }

    return new URL(path, ctx.services.workspaceOrigin ?? ctx.services.requestOrigin ?? 'http://localhost:3000').toString();
}

function buildComparisonWorkspaceUrl(ctx: ActionContext<WebActionServices>, comparisonId: string, runId?: string | null) {
    const basePath = `/${encodeURIComponent(ctx.organizationId)}/comparisons/${encodeURIComponent(comparisonId)}`;
    const path = runId ? `${basePath}/runs/${encodeURIComponent(runId)}` : basePath;
    if (ctx.runtime === 'desktop') {
        const url = new URL(`${getDesktopProtocolSchemeForServer()}://open`);
        url.searchParams.set('path', path);
        return url.toString();
    }
    return new URL(path, ctx.services.workspaceOrigin ?? ctx.services.requestOrigin ?? 'http://localhost:3000').toString();
}

function withWork(data: unknown, work: ResolvedMcpWork): Record<string, unknown> & { work: { workId: string; workspaceUrl: string }; workspaceUrl: string } {
    const base = isRecord(data) ? data : { value: data };
    return {
        ...base,
        workspaceUrl: work.workspaceUrl,
        work: {
            workId: work.workId,
            workspaceUrl: work.workspaceUrl,
        },
    };
}

async function resolveMcpWork(
    ctx: ActionContext<WebActionServices>,
    input: { connectionId?: string | null; workId?: string | null; externalSessionId?: string | null; title?: string | null; metadata?: Record<string, unknown> | null },
) {
    const workId = input.workId?.trim() || null;
    const externalSessionId = input.externalSessionId?.trim() || null;
    if (!workId && !externalSessionId) {
        throw new McpFacadeError('MISSING_WORK_CONTEXT', `Missing workId. ${WORK_CONTEXT_INSTRUCTION}`, {
            status: 400,
            details: {
                required: 'workId',
                nextStep: WORK_CONTEXT_INSTRUCTION,
            },
        });
    }

    const work = await ctx.services.db.works.resolveExisting({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        tokenId: ctx.actor.id ?? null,
        connectionId: input.connectionId ?? null,
        workId,
        externalSessionId,
        title: input.title ?? null,
        metadata: input.metadata ?? null,
    });
    if (!work) {
        throw new McpFacadeError(
            workId ? 'WORK_NOT_FOUND' : 'WORK_SESSION_NOT_FOUND',
            workId ? `Work not found: ${workId}.` : `No existing work found for externalSessionId: ${externalSessionId}.`,
            {
                status: 404,
                details: {
                    workId,
                    externalSessionId,
                    nextStep: WORK_CONTEXT_INSTRUCTION,
                },
            },
        );
    }

    return {
        workId: work.workId,
        connectionId: work.connectionId ?? input.connectionId ?? null,
        externalSessionId: work.externalSessionId ?? input.externalSessionId ?? null,
        workspaceUrl: buildWorkspaceUrl(ctx, work),
    };
}

function summarizeMcpOutput(output: unknown) {
    const value = toRecord(output);
    const workspaceAction = toRecord(value.workspaceAction);
    return {
        rowCount: value.rowCount ?? null,
        tabId: value.tabId ?? workspaceAction.tabId ?? null,
        sessionId: value.sessionId ?? null,
        comparisonId: value.comparisonId ?? null,
        resultSetId: value.resultSetId ?? null,
        readiness: toRecord(value.summary).readiness ?? null,
        status: value.status ?? null,
    };
}

async function executeWithWork(ctx: ActionContext<WebActionServices>, toolName: string, rawInput: unknown, run: (input: UnknownRecord, work: ResolvedMcpWork) => Promise<unknown>) {
    const input = toRecord(rawInput);
    const t0 = performance.now();
    const work = await resolveMcpWork(ctx, input);
    try {
        const output = await run(input, work);
        await ctx.services.db.works.recordEvent({
            workId: work.workId,
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            tokenId: ctx.actor.id ?? null,
            connectionId: work.connectionId,
            toolName,
            status: 'success',
            inputSummary: ctx.services.db.works.summarizeInput(input),
            outputSummary: summarizeMcpOutput(output),
            durationMs: performance.now() - t0,
        });
        return output;
    } catch (error: unknown) {
        const structuredError = toMcpStructuredError(error);
        await ctx.services.db.works.recordEvent({
            workId: work.workId,
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            tokenId: ctx.actor.id ?? null,
            connectionId: work.connectionId,
            toolName,
            status: 'error',
            inputSummary: ctx.services.db.works.summarizeInput(input),
            errorCode: structuredError.code ?? null,
            errorMessage: structuredError.message,
            durationMs: performance.now() - t0,
        });
        throw error;
    }
}

function toMcpStructuredError(error: unknown) {
    const record = isRecord(error) ? (error as unknown as McpStructuredError) : null;
    if (record && typeof record.code === 'string' && record.message) {
        return {
            code: record.code,
            message: record.message,
            details: record.details ?? null,
        };
    }

    const actionError = toActionError(error);
    return {
        code: actionError.code,
        message: actionError.message,
        details: actionError.details ?? null,
    };
}

function toPublicConnection(item: unknown) {
    const wrapper = toRecord(item);
    const connection = toRecord(wrapper.connection ?? item);
    const rawIdentities = Array.isArray(wrapper.identities) ? wrapper.identities : Array.isArray(connection.identities) ? connection.identities : [];
    const identities = rawIdentities.map(toRecord);
    const defaultIdentity = identities.find(identity => identity.isDefault) ?? identities[0] ?? {};
    const defaultDatabase = connection.database ?? defaultIdentity.database ?? null;
    const lastUsedAt = connection.lastUsedAt ?? connection.updatedAt ?? null;

    return {
        connectionId: String(connection.id ?? wrapper.id ?? ''),
        name: getString(connection.name),
        type: getString(connection.type ?? connection.engine),
        environment: getString(connection.environment),
        defaultDatabase,
        lastUsedAt: lastUsedAt instanceof Date ? lastUsedAt.toISOString() : (lastUsedAt ?? null),
        permissionsSummary: 'read-only SQL, schema exploration, workspace tabs, and saved queries according to granted scopes',
    };
}

async function findSqlTab(ctx: ActionContext<WebActionServices>, connectionId: string, tabId: string, workId?: string | null) {
    const tabs = await executeInternal<UnknownRecord[]>(ctx, 'tab.list', { connectionId, workId: workId ?? null });
    const tab = tabs.find(item => item.tabId === tabId);
    if (!tab) {
        const anyWorkTab = await ctx.services.db.tabState.loadTabStateById(tabId, ctx.userId, connectionId);
        if (anyWorkTab) {
            throw new McpFacadeError('SQL_TAB_WORK_MISMATCH', `SQL tab ${tabId} belongs to a different work context.`, {
                status: 409,
                details: {
                    tabId,
                    expectedWorkId: workId ?? null,
                    actualWorkId: anyWorkTab.workId ?? null,
                    nextStep: 'Use the workId that owns this tab, or create a new SQL tab inside the current work before appending or replacing SQL.',
                },
            });
        }

        throw new McpFacadeError('SQL_TAB_NOT_FOUND', `SQL tab not found: ${tabId}.`, {
            status: 404,
            details: {
                tabId,
                workId: workId ?? null,
            },
        });
    }
    if (tab.tabType !== 'sql') {
        throw new McpFacadeError('SQL_TAB_TYPE_MISMATCH', `Target tab must be a SQL tab: ${tabId}.`, {
            status: 409,
            details: {
                tabId,
                tabType: tab.tabType ?? null,
                workId: workId ?? null,
            },
        });
    }
    return tab;
}

async function applySqlWorkspaceAction(
    ctx: ActionContext<WebActionServices>,
    input: {
        connectionId: string;
        sql: string;
        workspaceMode?: 'none' | 'create_tab' | 'append_to_tab' | 'replace_tab';
        targetTabId?: string;
        tabName?: string;
        appendSeparator?: string;
        resultMeta?: Record<string, unknown> | null;
        workId?: string | null;
    },
): Promise<WorkspaceActionResult> {
    const mode = input.workspaceMode ?? 'none';
    if (mode === 'none') {
        return {
            mode,
            status: 'skipped' as const,
        };
    }

    const sql = ensureSqlStatementBoundary(input.sql);

    if (mode === 'create_tab') {
        const tab = await executeInternal<{ tabId: string; tabName?: string | null }>(ctx, 'tab.create', {
            connectionId: input.connectionId,
            tabType: 'sql',
            tabName: input.tabName ?? 'MCP query',
            content: sql,
            resultMeta: input.resultMeta ?? null,
            workId: input.workId ?? null,
        });
        return {
            mode,
            tabId: tab.tabId,
            tabName: tab.tabName ?? input.tabName,
            status: 'created' as const,
        };
    }

    const targetTabId = requireString(input.targetTabId, 'targetTabId');
    const existing = await findSqlTab(ctx, input.connectionId, targetTabId, input.workId ?? null);
    const content = mode === 'append_to_tab' ? appendSqlToTabContent(existing.content, sql, input.appendSeparator ?? DEFAULT_APPEND_SEPARATOR) : sql;
    const tabName = input.tabName ?? getString(existing.tabName);

    await executeInternal(ctx, 'tab.save', {
        connectionId: input.connectionId,
        tabId: targetTabId,
        state: {
            ...existing,
            content,
            tabName,
            tabType: 'sql',
        },
        resultMeta: input.resultMeta ?? existing.resultMeta ?? null,
        workId: input.workId ?? existing.workId ?? null,
    });

    return {
        mode,
        tabId: targetTabId,
        tabName: tabName ?? undefined,
        status: 'updated' as const,
    };
}

async function runReadonlySqlFacade(ctx: ActionContext<WebActionServices>, rawInput: unknown, work: ResolvedMcpWork) {
    const input = readonlySqlInputSchema.parse(rawInput);
    const output = await executeInternal<ReadonlySqlExecutionOutput>(ctx, 'query.readOnlyExecute', {
        connectionId: input.connectionId,
        database: input.database,
        sql: input.sql,
        limit: input.maxRows,
        identityId: input.identityId,
    });
    const firstSet = firstResultSet(output);
    const workspaceMode = input.workspaceMode && input.workspaceMode !== 'none' ? input.workspaceMode : input.targetTabId ? 'replace_tab' : 'create_tab';
    const workspaceAction = await applySqlWorkspaceAction(ctx, {
        connectionId: input.connectionId,
        sql: input.sql,
        workspaceMode,
        targetTabId: input.targetTabId,
        tabName: input.tabName,
        appendSeparator: input.appendSeparator,
        workId: work.workId,
        resultMeta: {
            rows: firstSet.rowCount,
            columns: firstSet.columns.length,
            durationMs: firstSet.executionTimeMs,
        },
    });
    const tabId = 'tabId' in workspaceAction ? workspaceAction.tabId : undefined;
    if (output.session && tabId) {
        output.session.tabId = tabId;
    }
    await ctx.services.db.works.saveSqlSnapshot(work.workId, output);
    work.workspaceUrl = buildWorkspaceUrl(ctx, { workId: work.workId, connectionId: input.connectionId }, { tabId, sessionId: output.session.sessionId });

    return withWork(
        {
            result: firstSet.rows,
            columns: firstSet.columns,
            rowCount: firstSet.rowCount,
            truncated: firstSet.truncated,
            executionTimeMs: firstSet.executionTimeMs,
            tabId,
            sessionId: output.session.sessionId,
            resultSetIds: output.queryResultSets.map(set => ({ sessionId: set.sessionId, setIndex: set.setIndex })),
            workspaceAction,
        },
        work,
    );
}

async function exploreSchemaFacade(ctx: ActionContext<WebActionServices>, rawInput: unknown, work: ResolvedMcpWork) {
    const input = schemaExploreInputSchema.parse(rawInput);
    const run = async () => {
        switch (input.operation) {
            case 'search':
                return executeInternal(ctx, 'schema.search', {
                    connectionId: input.connectionId,
                    query: input.query ?? '',
                    database: input.database,
                    limit: input.limit,
                    includeColumns: input.includeColumns,
                    identityId: input.identityId,
                });
            case 'list_databases':
                return executeInternal(ctx, 'schema.listDatabases', {
                    connectionId: input.connectionId,
                    identityId: input.identityId,
                });
            case 'list_tables':
                return executeInternal(ctx, 'schema.listTables', {
                    connectionId: input.connectionId,
                    database: requireString(input.database, 'database'),
                    identityId: input.identityId,
                });
            case 'describe_table':
                return executeInternal(ctx, 'schema.describeTable', {
                    connectionId: input.connectionId,
                    database: requireString(input.database, 'database'),
                    table: requireString(input.table, 'table'),
                    identityId: input.identityId,
                });
            case 'preview_table':
                return executeInternal(ctx, 'table.preview', {
                    connectionId: input.connectionId,
                    database: requireString(input.database, 'database'),
                    table: requireString(input.table, 'table'),
                    limit: input.limit,
                    offset: input.offset,
                    sort: input.sort,
                    filters: input.filters,
                    search: input.search,
                    searchColumns: input.searchColumns,
                    identityId: input.identityId,
                });
            case 'table_profile':
                return executeInternal(ctx, 'table.getProfile', {
                    connectionId: input.connectionId,
                    database: requireString(input.database, 'database'),
                    table: requireString(input.table, 'table'),
                    identityId: input.identityId,
                });
            case 'get_ddl':
                return executeInternal(ctx, 'table.getDdl', {
                    connectionId: input.connectionId,
                    database: requireString(input.database, 'database'),
                    table: requireString(input.table, 'table'),
                    identityId: input.identityId,
                });
        }
    };
    return withWork(await run(), work);
}

async function getSchemaGraphFacade(ctx: ActionContext<WebActionServices>, rawInput: unknown, work: ResolvedMcpWork) {
    const input = schemaGraphInputSchema.parse(rawInput);
    const result = await executeInternal(ctx, 'schema.getGraph', {
        connectionId: input.connectionId,
        database: input.database,
        schemas: input.schemas,
        focusTables: input.focusTables,
        depth: input.depth,
        columnMode: input.columnMode,
        identityId: input.identityId,
    });
    return withWork(result, work);
}

async function compareSchemaFacade(ctx: ActionContext<WebActionServices>, rawInput: unknown, work: ResolvedMcpWork) {
    const input = compareSchemaInputSchema.parse(rawInput);
    const source = input.source ?? input.current;
    const target = input.target ?? input.desired;
    const output = toRecord(
        input.comparisonId
            ? await executeInternal(ctx, 'comparison.run.create', {
                  comparisonId: input.comparisonId,
                  workId: work.workId,
              })
            : await executeInternal(ctx, 'comparison.create', {
                  name: input.name ?? `${source!.database} → ${target!.database}`,
                  source: {
                      connectionId: source!.connectionId,
                      identityId: source!.identityId,
                      database: source!.database,
                  },
                  target: {
                      connectionId: target!.connectionId,
                      identityId: target!.identityId,
                      database: target!.database,
                  },
                  schemaFilter: input.schemaFilter ?? source!.schemas,
                  objectTypes: input.objectTypes,
                  workId: work.workId,
              }),
    );
    const comparison = toRecord(output.comparison);
    const run = toRecord(output.run);
    const result = toRecord(output.result);
    const summary = toRecord(result.summary ?? run.summary);
    const topChanges = (Array.isArray(output.topChanges) ? output.topChanges : []).slice(0, 10);
    const comparisonId = requireString(comparison.id, 'comparisonId');
    const runId = requireString(run.id, 'runId');
    work.workspaceUrl = buildComparisonWorkspaceUrl(ctx, comparisonId, runId);
    return withWork(
        {
            comparisonId,
            runId,
            resultSetId: getString(run.resultSetId),
            changes: Number(summary.totalChanges ?? 0),
            risks: Number(summary.highRisk ?? 0) + Number(summary.mediumRisk ?? 0) + Number(summary.unknownRisk ?? 0),
            readiness: summary.readiness ?? null,
            summary,
            coverage: result.coverage ?? run.coverage ?? null,
            highestRiskChanges: topChanges,
        },
        work,
    );
}

async function analyzeDatabaseChangesFacade(ctx: ActionContext<WebActionServices>, rawInput: unknown, work: ResolvedMcpWork) {
    const input = analyzeDatabaseChangesInputSchema.parse(rawInput);
    const existingRun = await ctx.services.db.comparisons.getRunById(ctx.organizationId, input.runId);
    const output = toRecord(
        await executeInternal(ctx, 'comparison.run.aiReview', {
            comparisonId: existingRun.comparisonId,
            runId: existingRun.id,
            deploymentContext: input.deploymentContext,
        }),
    );
    const run = toRecord(output.run);
    work.workspaceUrl = buildComparisonWorkspaceUrl(ctx, existingRun.comparisonId, existingRun.id);
    return withWork(
        {
            comparisonId: existingRun.comparisonId,
            runId: existingRun.id,
            resultSetId: getString(run.resultSetId),
            summary: run.summary ?? null,
            coverage: run.coverage ?? null,
            aiReview: output.review ?? null,
        },
        work,
    );
}

async function workspaceTabsFacade(ctx: ActionContext<WebActionServices>, rawInput: unknown, work: ResolvedMcpWork) {
    const input = workspaceTabsInputSchema.parse(rawInput);
    switch (input.operation) {
        case 'list':
            return withWork(
                {
                    tabs: await executeInternal(ctx, 'tab.list', {
                        connectionId: input.connectionId,
                        workId: work.workId,
                    }),
                },
                work,
            );
        case 'create_sql': {
            const tab = await executeInternal<{ tabId: string }>(ctx, 'tab.create', {
                connectionId: input.connectionId,
                workId: work.workId,
                tabType: 'sql',
                tabName: input.tabName ?? 'MCP query',
                content: requireString(input.sql, 'sql'),
            });
            work.workspaceUrl = buildWorkspaceUrl(ctx, { workId: work.workId, connectionId: input.connectionId }, { tabId: tab.tabId });
            return withWork(tab, work);
        }
        case 'append_sql': {
            const tabId = requireString(input.tabId, 'tabId');
            const sql = requireString(input.sql, 'sql');
            const workspaceAction = await applySqlWorkspaceAction(ctx, {
                connectionId: input.connectionId,
                sql,
                workspaceMode: 'append_to_tab',
                targetTabId: tabId,
                tabName: input.tabName,
                appendSeparator: input.appendSeparator,
                workId: work.workId,
            });
            work.workspaceUrl = buildWorkspaceUrl(ctx, { workId: work.workId, connectionId: input.connectionId }, { tabId });
            return withWork({ workspaceAction }, work);
        }
        case 'replace_sql': {
            const tabId = requireString(input.tabId, 'tabId');
            const sql = requireString(input.sql, 'sql');
            const workspaceAction = await applySqlWorkspaceAction(ctx, {
                connectionId: input.connectionId,
                sql,
                workspaceMode: 'replace_tab',
                targetTabId: tabId,
                tabName: input.tabName,
                workId: work.workId,
            });
            work.workspaceUrl = buildWorkspaceUrl(ctx, { workId: work.workId, connectionId: input.connectionId }, { tabId });
            return withWork({ workspaceAction }, work);
        }
        case 'delete':
            return withWork(
                await executeInternal(ctx, 'tab.delete', {
                    connectionId: input.connectionId,
                    workId: work.workId,
                    tabId: requireString(input.tabId, 'tabId'),
                }),
                work,
            );
        case 'open_table': {
            const tab = await executeInternal<{ tabId: string }>(ctx, 'tab.create', {
                connectionId: input.connectionId,
                workId: work.workId,
                tabType: 'table',
                tabName: input.tabName ?? input.tableName,
                databaseName: requireString(input.databaseName, 'databaseName'),
                tableName: requireString(input.tableName, 'tableName'),
                activeSubTab: input.activeSubTab ?? 'data',
            });
            work.workspaceUrl = buildWorkspaceUrl(ctx, { workId: work.workId, connectionId: input.connectionId }, { tabId: tab.tabId });
            return withWork(tab, work);
        }
    }
}

async function savedQueriesFacade(ctx: ActionContext<WebActionServices>, rawInput: unknown, work: ResolvedMcpWork) {
    const input = savedQueriesInputSchema.parse(rawInput);
    switch (input.operation) {
        case 'list':
            return withWork(
                await executeInternal(ctx, 'savedQuery.list', {
                    connectionId: input.connectionId,
                    limit: input.limit,
                    includeArchived: input.includeArchived,
                }),
                work,
            );
        case 'get':
            return withWork(
                await executeInternal(ctx, 'savedQuery.get', {
                    connectionId: input.connectionId,
                    id: requireString(input.id, 'id'),
                    includeArchived: input.includeArchived,
                }),
                work,
            );
        case 'create':
            return withWork(
                await executeInternal(ctx, 'savedQuery.create', {
                    connectionId: input.connectionId,
                    id: input.id,
                    title: requireString(input.title, 'title'),
                    description: input.description,
                    folderId: input.folderId,
                    sqlText: requireString(input.sqlText, 'sqlText'),
                    context: input.context,
                    tags: input.tags,
                    workId: work.workId,
                }),
                work,
            );
        case 'update':
            return withWork(
                await executeInternal(ctx, 'savedQuery.update', {
                    connectionId: input.connectionId,
                    id: requireString(input.id, 'id'),
                    patch: input.patch ?? {
                        ...(typeof input.title !== 'undefined' ? { title: input.title } : {}),
                        ...(typeof input.description !== 'undefined' ? { description: input.description } : {}),
                        ...(typeof input.folderId !== 'undefined' ? { folderId: input.folderId } : {}),
                        ...(typeof input.sqlText !== 'undefined' ? { sqlText: input.sqlText } : {}),
                        ...(typeof input.context !== 'undefined' ? { context: input.context } : {}),
                        ...(typeof input.tags !== 'undefined' ? { tags: input.tags } : {}),
                    },
                }),
                work,
            );
        case 'delete':
            return withWork(
                await executeInternal(ctx, 'savedQuery.delete', {
                    connectionId: input.connectionId,
                    id: requireString(input.id, 'id'),
                }),
                work,
            );
    }
}

async function createWorkFacade(ctx: ActionContext<WebActionServices>, rawInput: unknown) {
    const input = createWorkInputSchema.parse(rawInput);
    const title = normalizeWorkTitle(input) ?? DEFAULT_WORK_TITLE;
    const work = await ctx.services.db.works.create({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        tokenId: ctx.actor.id ?? null,
        connectionId: input.connectionId ?? null,
        externalSessionId: input.externalSessionId ?? null,
        title,
        metadata: input.metadata ?? null,
    });
    const workspaceUrl = buildWorkspaceUrl(ctx, work);
    await ctx.services.db.works.recordEvent({
        workId: work.workId,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        tokenId: ctx.actor.id ?? null,
        connectionId: work.connectionId ?? null,
        toolName: 'dory_create_work',
        status: 'success',
        inputSummary: ctx.services.db.works.summarizeInput(input),
        outputSummary: { workId: work.workId },
    });
    return {
        workId: work.workId,
        title: work.title,
        status: work.status,
        connectionId: work.connectionId,
        externalSessionId: work.externalSessionId,
        workspaceUrl,
        createdAt: work.createdAt instanceof Date ? work.createdAt.toISOString() : work.createdAt,
        work: {
            workId: work.workId,
            workspaceUrl,
        },
    };
}

async function actionTransportFacade(ctx: ActionContext<WebActionServices>, rawInput: unknown, access: ActionTransportAccess) {
    const input = actionTransportInputSchema.parse(rawInput);

    if (input.operation === 'list') {
        const actions = webActionRegistry
            .list()
            .filter(action => isActionVisibleInMcpCatalog(ctx, action, access))
            .map(action => actionMetadata(action))
            .sort((a, b) => a.id.localeCompare(b.id));
        return { actions };
    }

    const actionId = requireString(input.actionId, 'actionId') as ActionId;
    const action = webActionRegistry.get(actionId);
    if (!action) {
        throw new McpFacadeError('ACTION_NOT_FOUND', `Unknown action: ${actionId}`, { status: 404, details: { actionId } });
    }

    if (input.operation === 'describe') {
        if (!isActionDescribableInMcpCatalog(action, access)) {
            throw new McpFacadeError('ACTION_NOT_AVAILABLE', `Action "${action.id}" is not available through dory_${access}.`, {
                status: 403,
                details: { actionId: action.id, access },
            });
        }
        return { action: actionMetadata(action, input.projection), availability: actionAvailability(ctx, action) };
    }

    assertActionRunnableByMcp(action, access);
    const result = await executeAction(ctx, action.id, input.input ?? {}, {
        projection: input.projection,
        confirmationToken: access === 'write' && actionRequiresConfirmation(action) ? MCP_CLIENT_APPROVED_CONFIRMATION_TOKEN : null,
        reason: input.reason,
    });
    return {
        ok: true,
        actionId: action.id,
        data: result.data,
        execution: result.execution,
    };
}

async function finishWorkFacade(ctx: ActionContext<WebActionServices>, rawInput: unknown, work: ResolvedMcpWork) {
    const input = finishWorkInputSchema.parse(rawInput);
    const updated = await ctx.services.db.works.finishWithSummary({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        workId: work.workId,
        status: input.status,
        summaryTitle: input.summaryTitle ?? null,
        findings: input.findings,
        steps: input.steps,
    });

    work.connectionId = updated.connectionId ?? work.connectionId;
    work.workspaceUrl = buildWorkspaceUrl(ctx, updated);
    const summary = getAgentRunSummary(updated.metadata);

    return withWork(
        {
            status: updated.status,
            summaryTitle: summary?.summaryTitle ?? null,
            findings: summary?.findings ?? input.findings,
            steps: summary?.steps ?? input.steps,
        },
        work,
    );
}

export function structuredMcpFacadeResult(data: unknown) {
    const structuredContent = isRecord(data) ? data : { value: data };

    return {
        isError: false as const,
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(data, null, 2),
            },
        ],
        structuredContent,
    };
}

export function structuredMcpFacadeError(error: unknown) {
    const structuredError = toMcpStructuredError(error);
    const output = {
        ok: false,
        error: {
            code: structuredError.code,
            message: structuredError.message,
            details: structuredError.details,
        },
    };

    return {
        isError: true as const,
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(output, null, 2),
            },
        ],
        structuredContent: output,
    };
}

export function getPublicDoryMcpTools(): McpFacadeTool[] {
    return [
        {
            name: 'dory_create_work',
            title: 'Create Dory Work',
            description:
                'Create or reuse one Dory Agent Run work context for query, analysis, SQL, schema exploration, schema comparison, workspace tab, or saved query tools. Use a short title based on the user question, then pass the returned work.workId as workId to those work-scoped tools.',
            inputSchema: createWorkInputSchema,
            outputSchema: unknownObjectOutputSchema,
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                openWorldHint: true,
            },
            execute: createWorkFacade,
        },
        {
            name: 'dory_finish_work',
            title: 'Finish Dory Work',
            description:
                'Finish or update a Dory Agent Run with structured Run summary content. Provide findings for analytical conclusions and steps for execution actions. Requires an existing workId.',
            inputSchema: finishWorkInputSchema,
            outputSchema: unknownObjectOutputSchema,
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                openWorldHint: true,
            },
            execute: (ctx, input) => executeWithWork(ctx, 'dory_finish_work', input, (parsed, work) => finishWorkFacade(ctx, parsed, work)),
        },
        {
            name: 'dory_read',
            title: 'Read Dory Actions',
            description:
                'List, describe, or run read-only or low-risk Dory Actions by actionId. Use this for Action registry capabilities such as connection.list, connection.test, schema exploration, and other read operations.',
            inputSchema: actionTransportInputSchema,
            outputSchema: unknownObjectOutputSchema,
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                openWorldHint: true,
            },
            execute: (ctx, input) => actionTransportFacade(ctx, input, 'read'),
        },
        {
            name: 'dory_write',
            title: 'Write Dory Actions',
            description:
                'List, describe, or run write-capable Dory Actions by actionId. Use this for configuration actions such as connection.create, connection.update, and connection.delete; these connection management actions do not require workId. This tool call is treated as MCP-client-approved for destructive Action confirmation.',
            inputSchema: actionTransportInputSchema,
            outputSchema: unknownObjectOutputSchema,
            annotations: {
                readOnlyHint: false,
                destructiveHint: true,
                openWorldHint: true,
            },
            execute: (ctx, input) => actionTransportFacade(ctx, input, 'write'),
        },
        {
            name: 'dory_list_connections',
            title: 'List Dory connections',
            description: `List available Dory database connections with enough context to choose the likely target connection. Requires an existing workId. ${WORK_CONTEXT_INSTRUCTION}`,
            inputSchema: connectionListInputSchema,
            outputSchema: connectionListOutputSchema,
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
            execute: async (ctx, rawInput) =>
                executeWithWork(ctx, 'dory_list_connections', rawInput, async (_input, work) => {
                    const output = await executeInternal<UnknownRecord>(ctx, 'connection.list', {});
                    return withWork(
                        {
                            connections: (Array.isArray(output.connections) ? output.connections : []).map(toPublicConnection).filter(item => item.connectionId),
                        },
                        work,
                    );
                }),
        },
        {
            name: 'dory_artifacts',
            title: 'Read Dory Artifact',
            description: `Read one organization Artifact by ID, including its source metadata, schema, chart configuration, and at most 200 Result Set preview rows. Requires an existing workId. ${WORK_CONTEXT_INSTRUCTION}`,
            inputSchema: artifactReadInputSchema,
            outputSchema: unknownObjectOutputSchema,
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: false,
            },
            execute: (ctx, rawInput) =>
                executeWithWork(ctx, 'dory_artifacts', rawInput, async (input, work) => {
                    const artifactId = requireString(input.artifactId, 'artifactId');
                    const artifact = await executeInternal<UnknownRecord>(ctx, 'artifact.get', { artifactId });
                    const sourceResultSetId = getString(artifact.sourceResultSetId);
                    const previewRows = Math.min(getNumber(input.previewRows) ?? 100, 200);
                    const result = sourceResultSetId
                        ? await executeInternal<UnknownRecord>(ctx, 'resultSet.rows.read', {
                              resultSetId: sourceResultSetId,
                              offset: 0,
                              limit: previewRows,
                          }).catch(() => null)
                        : null;
                    return withWork(
                        {
                            artifact,
                            preview: result
                                ? {
                                      rows: Array.isArray(result.rows) ? result.rows.slice(0, previewRows) : [],
                                      columns: Array.isArray(result.columns) ? result.columns : [],
                                      rowCount: getNumber(result.rowCount),
                                      limited: (getNumber(result.rowCount) ?? 0) > previewRows,
                                  }
                                : null,
                        },
                        work,
                    );
                }),
        },
        {
            name: 'dory_explore_schema',
            title: 'Explore Dory schema',
            description: `Explore available data, find business fields, inspect table structure, preview table rows, get table profiles, and fetch table DDL. Requires an existing workId. ${WORK_CONTEXT_INSTRUCTION}`,
            inputSchema: schemaExploreInputSchema,
            outputSchema: unknownObjectOutputSchema,
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
            execute: (ctx, input) => executeWithWork(ctx, 'dory_explore_schema', input, (parsed, work) => exploreSchemaFacade(ctx, parsed, work)),
        },
        {
            name: 'dory_get_schema_graph',
            title: 'Get Dory schema graph',
            description: `Return tables, columns, primary keys, and declared foreign-key relationships for a Dory connection. Supports schema scopes and one- or two-hop table neighborhoods. Requires an existing workId. ${WORK_CONTEXT_INSTRUCTION}`,
            inputSchema: schemaGraphInputSchema,
            outputSchema: unknownObjectOutputSchema,
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
            execute: (ctx, input) => executeWithWork(ctx, 'dory_get_schema_graph', input, (parsed, work) => getSchemaGraphFacade(ctx, parsed, work)),
        },
        {
            name: 'dory_compare_schema',
            title: 'Compare database schemas',
            description: `Run a saved Dory Comparison by comparisonId, or create and run a saved Source → Target schema Comparison. Returns stable comparisonId and runId values plus a bounded deterministic summary. Only same-family dialects are accepted. Requires an existing workId. ${WORK_CONTEXT_INSTRUCTION}`,
            inputSchema: compareSchemaInputSchema,
            outputSchema: unknownObjectOutputSchema,
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                openWorldHint: true,
            },
            execute: (ctx, input) => executeWithWork(ctx, 'dory_compare_schema', input, (parsed, work) => compareSchemaFacade(ctx, parsed, work)),
        },
        {
            name: 'dory_analyze_database_changes',
            title: 'Analyze database changes',
            description: `Generate or retry an evidence-cited AI Review for an accessible immutable Comparison Run by runId. The AI explains but cannot change canonical risk or readiness. Requires an existing workId. ${WORK_CONTEXT_INSTRUCTION}`,
            inputSchema: analyzeDatabaseChangesInputSchema,
            outputSchema: unknownObjectOutputSchema,
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                openWorldHint: true,
            },
            execute: (ctx, input) => executeWithWork(ctx, 'dory_analyze_database_changes', input, (parsed, work) => analyzeDatabaseChangesFacade(ctx, parsed, work)),
        },
        {
            name: 'dory_run_readonly_sql',
            title: 'Run read-only SQL',
            description: `Run read-only SQL against a Dory connection, update the existing Agent Run workspace tab, and persist a result snapshot. Requires an existing workId. ${WORK_CONTEXT_INSTRUCTION}`,
            inputSchema: readonlySqlInputSchema,
            outputSchema: readonlySqlOutputSchema,
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                openWorldHint: true,
            },
            execute: (ctx, input) => executeWithWork(ctx, 'dory_run_readonly_sql', input, (parsed, work) => runReadonlySqlFacade(ctx, parsed, work)),
        },
        {
            name: 'dory_workspace_tabs',
            title: 'Manage Dory workspace tabs',
            description: `Manage Dory workspace tabs: list tabs, create SQL tabs, append or replace SQL tab content, delete tabs, or open a table tab. Requires an existing workId. ${WORK_CONTEXT_INSTRUCTION}`,
            inputSchema: workspaceTabsInputSchema,
            outputSchema: unknownObjectOutputSchema,
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                openWorldHint: true,
            },
            execute: (ctx, input) => executeWithWork(ctx, 'dory_workspace_tabs', input, (parsed, work) => workspaceTabsFacade(ctx, parsed, work)),
        },
        {
            name: 'dory_saved_queries',
            title: 'Manage Dory saved queries',
            description: `Low-priority saved query facade for listing, reading, creating, updating, or deleting reusable saved SQL. Do not use this for ordinary one-off SQL execution. Requires an existing workId. ${WORK_CONTEXT_INSTRUCTION}`,
            inputSchema: savedQueriesInputSchema,
            outputSchema: unknownObjectOutputSchema,
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                openWorldHint: true,
            },
            execute: (ctx, input) => executeWithWork(ctx, 'dory_saved_queries', input, (parsed, work) => savedQueriesFacade(ctx, parsed, work)),
        },
    ];
}
