import 'server-only';

import { createAgentUIStreamResponse, createIdGenerator, type ToolSet, type UIMessage } from 'ai';
import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';

import { createChartBuilderTool } from '@/app/api/chat/tools/chart-builder';
import { createDoryChatTools } from '@/app/api/chat/tools/dory-tools';
import { buildUserLanguageInstruction } from '@/app/api/chat/utils';
import { getApiLocale } from '@/app/api/utils/i18n';
import { buildDoryAgentContext } from '@/lib/ai/agents/context';
import { buildDoryChatAgent } from '@/lib/ai/agents/chat-agent';
import { resolveDoryAgentModel } from '@/lib/ai/agents/model';
import { resolveAiRouteExecution, isLocalMissingAiEnvError } from '@/lib/ai/execution/route-dispatch';
import { createAiRequestId, recordAiUsage } from '@/lib/ai/gateway';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';
import { assertAiQuotaAllowed, buildCloudflareAiGatewayHeaders, isAiQuotaExceededError, resolveAiEntitlements, toAiQuotaExceededResponse } from '@/lib/ai/usage-quota';
import { AGENT_SCOPES } from '@/lib/actions/server/context.shared';
import { createWebActionAuditSink } from '@/lib/actions/server/action-audit';
import { executeAction } from '@/lib/actions/server/execute';
import type { WebActionServices } from '@/lib/actions/server/types';
import { resolveOrganizationAccess } from '@/lib/server/authz';
import { buildIncludedAnalysisConclusionFromFindings } from '@/lib/work/review-state';
import { workspaceScopeKey, type UITabPayload } from '@dory/shared/types/tabs';
import { getRuntimeForServer } from '@dory/shared/runtime';
import type { ActionContext } from '@dory/actions';
import type { DBService } from '@dory/database';
import type {
    WorkConclusionMetadata,
    WorkInvestigation,
    WorkInvestigationFinding,
    WorkRunEvent,
    WorkRunEventRole,
    WorkRunEventType,
    WorkWorkspaceSnapshot,
} from '@dory/database/postgres/schemas';
import { applyWorkAgentProtocolResult, checkWorkAgentProtocol, checkWorkAgentProtocolComplete, createWorkAgentProtocolState, workAgentProtocolError } from './protocol';
import { formatWorkspaceSnapshotForAgent } from './workspace-snapshot';

type RunWorkAgentOptions = {
    req: NextRequest;
    db: DBService;
    organizationId: string;
    userId: string;
    workId: string;
    workspaceSnapshotId?: string | null;
    focusInvestigationId?: string | null;
    focusTabId?: string | null;
    trigger?: 'user_instruction' | 'continue_from_workspace' | 'continue_from_tab' | null;
    mode?: WorkRunMode | null;
    userInstruction?: string | null;
};

type WorkRunMode = 'run' | 'continue_work' | 'revise_analysis' | 'update_conclusion' | 'rerun_from_scratch';

type ExistingRunAnalysis = {
    id: string;
    title: string;
    auditStatus: WorkInvestigation['auditStatus'];
    findingsCount: number;
    sqlAssetCount: number;
    lastQueryAt: Date | null;
    updatedAt: Date;
    createdAt: Date;
};

function mergeHeaders(headers: Record<string, string | undefined> | undefined, extraHeaders: Record<string, string> | null): Record<string, string | undefined> | undefined {
    if (!extraHeaders) return headers;
    return {
        ...(headers ?? {}),
        ...extraHeaders,
    };
}

function sanitizePayload(value: unknown): Record<string, unknown> | null {
    if (value === null || value === undefined) return null;

    try {
        const text = JSON.stringify(value, (_key, item) => {
            if (typeof item === 'bigint') return item.toString();
            if (typeof item === 'function') return '[Function]';
            if (item instanceof Error) return { name: item.name, message: item.message };
            return item;
        });
        if (!text) return null;
        const bounded = text.length > 12000 ? `${text.slice(0, 12000)}…` : text;
        const parsed = JSON.parse(bounded.endsWith('…') ? JSON.stringify({ truncated: true, preview: bounded }) : bounded);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { value: parsed };
    } catch {
        return { value: String(value) };
    }
}

function countSqlAssetsByInvestigation(events: WorkRunEvent[]) {
    const counts = new Map<string, number>();
    for (const event of events) {
        if (event.type !== 'sql_executed') continue;
        const payload = event.payload && typeof event.payload === 'object' ? event.payload : null;
        const investigationId = payload?.investigationId;
        if (typeof investigationId !== 'string' || !investigationId) continue;
        counts.set(investigationId, (counts.get(investigationId) ?? 0) + 1);
    }
    return counts;
}

function countFindingsByInvestigation(findings: WorkInvestigationFinding[]) {
    const counts = new Map<string, number>();
    for (const finding of findings) {
        counts.set(finding.investigationId, (counts.get(finding.investigationId) ?? 0) + 1);
    }
    return counts;
}

function existingRunAnalysisScore(analysis: ExistingRunAnalysis) {
    return analysis.findingsCount * 100 + analysis.sqlAssetCount * 10 + (analysis.lastQueryAt ? 1 : 0);
}

function selectExistingRunAnalyses(input: { investigations: WorkInvestigation[]; findings: WorkInvestigationFinding[]; runEvents: WorkRunEvent[] }) {
    const findingCounts = countFindingsByInvestigation(input.findings);
    const sqlAssetCounts = countSqlAssetsByInvestigation(input.runEvents);
    return input.investigations
        .filter(investigation => investigation.auditStatus !== 'rejected')
        .map(
            (investigation): ExistingRunAnalysis => ({
                id: investigation.id,
                title: investigation.title,
                auditStatus: investigation.auditStatus,
                findingsCount: findingCounts.get(investigation.id) ?? 0,
                sqlAssetCount: Math.max(sqlAssetCounts.get(investigation.id) ?? 0, investigation.linkedTabId ? 1 : 0),
                lastQueryAt: investigation.lastQueryAt,
                updatedAt: investigation.updatedAt,
                createdAt: investigation.createdAt,
            }),
        )
        .sort((a, b) => {
            const scoreDiff = existingRunAnalysisScore(b) - existingRunAnalysisScore(a);
            if (scoreDiff !== 0) return scoreDiff;
            return b.updatedAt.getTime() - a.updatedAt.getTime() || b.createdAt.getTime() - a.createdAt.getTime();
        })
        .slice(0, 5);
}

function resetFindingCounts(analyses: ExistingRunAnalysis[]) {
    return analyses.map(analysis => ({
        ...analysis,
        findingsCount: 0,
    }));
}

function activeInvestigationIds(investigations: WorkInvestigation[]) {
    return investigations.filter(investigation => investigation.auditStatus !== 'rejected').map(investigation => investigation.id);
}

function scopedInvestigationsForConclusion(investigations: WorkInvestigation[], investigationIds: Set<string>) {
    return investigations.filter(investigation => investigationIds.has(investigation.id));
}

function scopedFindingsForConclusion(findings: WorkInvestigationFinding[], investigationIds: Set<string>) {
    return findings.filter(finding => investigationIds.has(finding.investigationId));
}

async function resetWorkRunOutputs(params: {
    db: DBService;
    organizationId: string;
    workId: string;
    findings: WorkInvestigationFinding[];
    investigationIds: string[];
    resetConclusion: boolean;
}) {
    const investigationIds = new Set(params.investigationIds);
    const findingsToDelete = params.findings.filter(finding => investigationIds.has(finding.investigationId));

    await Promise.all(
        findingsToDelete.map(finding =>
            params.db.works.deleteInvestigationFinding({
                organizationId: params.organizationId,
                workId: params.workId,
                id: finding.id,
            }),
        ),
    );

    if (params.resetConclusion) {
        await params.db.works.updateConclusion({
            organizationId: params.organizationId,
            id: params.workId,
            conclusion: null,
        });
    }
}

function existingAnalysesForPrompt(analyses: ExistingRunAnalysis[]) {
    if (analyses.length === 0) return '';
    return [
        'Existing Analyses',
        ...analyses.map(
            analysis =>
                `- investigationId: ${analysis.id}; title: ${analysis.title}; audit status: ${analysis.auditStatus}; findings: ${analysis.findingsCount}; sql assets: ${analysis.sqlAssetCount}`,
        ),
    ].join('\n');
}

function focusedAnalysisForPrompt(analysis: WorkInvestigation) {
    return ['Focused Analysis', `- investigationId: ${analysis.id}; title: ${analysis.title}; audit status: ${analysis.auditStatus}`].join('\n');
}

function toMessageContent(value: unknown, fallback: string) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (!value || typeof value !== 'object') return fallback;

    const record = value as Record<string, any>;
    if (typeof record.title === 'string' && record.title.trim()) return record.title.trim();
    if (typeof record.message === 'string' && record.message.trim()) return record.message.trim();
    if (record.ok === false && record.error?.message) return String(record.error.message);
    return fallback;
}

function toWorkToolEventContent(toolName: string, input: unknown, output: unknown, fallback: string) {
    if (toolName === 'work_updateConclusion') {
        const conclusion = typeof input === 'object' && input ? (input as Record<string, unknown>).conclusion : null;
        return typeof conclusion === 'string' && conclusion.trim() ? conclusion.trim() : fallback;
    }
    if (toolName === 'work_createInvestigationFinding') {
        const content = typeof input === 'object' && input ? (input as Record<string, unknown>).content : null;
        return typeof content === 'string' && content.trim() ? content.trim() : toMessageContent(output, fallback);
    }
    return toMessageContent(output, fallback);
}

function fallbackFindingContentFromSqlEvent(event: { payload?: Record<string, unknown> | null } | null) {
    const payload = event?.payload && typeof event.payload === 'object' ? event.payload : null;
    const query = payload?.query && typeof payload.query === 'object' ? (payload.query as Record<string, unknown>) : null;
    const sql = typeof payload?.sql === 'string' && payload.sql.trim() ? payload.sql.trim() : null;
    const rowCount = typeof query?.rowCount === 'number' ? query.rowCount : typeof query?.totalRows === 'number' ? query.totalRows : null;
    const durationMs = typeof query?.durationMs === 'number' ? query.durationMs : null;

    const details: string[] = [];
    if (rowCount !== null) details.push(`${rowCount} rows returned`);
    if (durationMs !== null) details.push(`${durationMs}ms execution time`);

    const suffix = details.length ? ` (${details.join(', ')}).` : '.';
    const sqlSummary = sql ? ` SQL: ${sql.length > 240 ? `${sql.slice(0, 240)}...` : sql}` : '';
    return `SQL result was reviewed and preserved for this Analysis${suffix}${sqlSummary}`.trim();
}

function fallbackWhyItMattersFromSqlEvent(event: { payload?: Record<string, unknown> | null } | null) {
    const payload = event?.payload && typeof event.payload === 'object' ? event.payload : null;
    const query = payload?.query && typeof payload.query === 'object' ? (payload.query as Record<string, unknown>) : null;
    const rowCount = typeof query?.rowCount === 'number' ? query.rowCount : typeof query?.totalRows === 'number' ? query.totalRows : null;
    if (rowCount === 0) return 'The query returned no rows, so this Analysis may not provide supporting evidence yet.';
    if (typeof rowCount === 'number') return 'This SQL-backed result gives the conclusion an auditable evidence point, but it still needs human review.';
    return 'This preserved SQL result keeps the Analysis traceable, but the Finding should be reviewed before relying on it.';
}

function buildFallbackConclusionMetadata(params: { includedCount: number; unconfirmedCount: number; fallback: boolean }): WorkConclusionMetadata {
    const caveats = [
        params.unconfirmedCount > 0
            ? `${params.unconfirmedCount} included ${params.unconfirmedCount === 1 ? 'analysis is' : 'analyses are'} Agent-generated or edited but not human-confirmed.`
            : null,
        params.fallback ? 'The conclusion was generated from available Findings after the Agent did not provide complete conclusion metadata.' : null,
    ].filter((item): item is string => Boolean(item));

    return {
        confidence: params.includedCount > 0 && params.unconfirmedCount === 0 && !params.fallback ? 'high' : params.includedCount > 0 ? 'medium' : 'low',
        caveats,
        recommendedNextStep: caveats.length ? 'Review the included evidence before treating this conclusion as final.' : null,
    };
}

function extractSqlEventSource(event: WorkRunEvent | null) {
    const payload = event?.payload && typeof event.payload === 'object' ? event.payload : null;
    return {
        tabId: typeof payload?.tabId === 'string' && payload.tabId ? payload.tabId : null,
        investigationId: typeof payload?.investigationId === 'string' && payload.investigationId ? payload.investigationId : null,
    };
}

async function createFallbackFindingForPendingSql(params: {
    db: DBService;
    organizationId: string;
    workId: string;
    protocol: ReturnType<typeof createWorkAgentProtocolState>;
    appendEvent: (event: {
        type: WorkRunEventType;
        role: WorkRunEventRole;
        content?: string | null;
        payload?: Record<string, unknown> | null;
        createdAt?: string | Date | null;
    }) => Promise<void>;
}) {
    const pending = params.protocol.pendingFinding;
    if (!pending) return null;

    const sourceEvent = pending.sourceRunEventId
        ? await params.db.works.getRunEventById({
              organizationId: params.organizationId,
              workId: params.workId,
              id: pending.sourceRunEventId,
          })
        : null;
    const content = fallbackFindingContentFromSqlEvent(sourceEvent);
    const whyItMatters = fallbackWhyItMattersFromSqlEvent(sourceEvent);
    const finding = await params.db.works.createInvestigationFinding({
        organizationId: params.organizationId,
        workId: params.workId,
        investigationId: pending.investigationId,
        content,
        whyItMatters,
        sourceTabId: pending.sourceTabId,
        sourceRunEventId: pending.sourceRunEventId,
        createdBy: 'agent',
    });

    applyWorkAgentProtocolResult(params.protocol, 'work_createInvestigationFinding', finding);
    await params.appendEvent({
        type: 'investigation_updated',
        role: 'agent',
        content,
        payload: sanitizePayload({
            toolName: 'work_createInvestigationFinding',
            output: finding,
            whyItMatters,
            fallback: true,
            reason: 'Agent ended with a SQL result that still needed a Finding before conclusion.',
        }),
    });
    return finding;
}

async function createFallbackFindingsForMissingAnalyses(params: {
    db: DBService;
    organizationId: string;
    workId: string;
    runId: string;
    protocol: ReturnType<typeof createWorkAgentProtocolState>;
    appendEvent: (event: {
        type: WorkRunEventType;
        role: WorkRunEventRole;
        content?: string | null;
        payload?: Record<string, unknown> | null;
        createdAt?: string | Date | null;
    }) => Promise<void>;
    reason: string;
}) {
    if (params.protocol.mode !== 'full_work') return [];
    if (params.protocol.existingInvestigationIds.length === 0 && params.protocol.createdInvestigationIds.length < 3) return [];

    const missingInvestigationIds = params.protocol.createdInvestigationIds.filter(
        id => params.protocol.auditStatusByInvestigationId[id] !== 'rejected' && (params.protocol.findingsByInvestigationId[id] ?? 0) < 1,
    );
    if (missingInvestigationIds.length === 0) return [];

    const [investigations, runEvents] = await Promise.all([
        params.db.works.listInvestigations({
            organizationId: params.organizationId,
            workId: params.workId,
        }),
        params.db.works.listRunEvents({
            organizationId: params.organizationId,
            workId: params.workId,
            runId: params.runId,
        }),
    ]);

    const investigationsById = new Map<string, WorkInvestigation>(investigations.map(investigation => [investigation.id, investigation]));
    const latestSqlEventByInvestigationId = new Map<string, WorkRunEvent>();
    for (const event of runEvents) {
        if (event.type !== 'sql_executed') continue;
        const { investigationId } = extractSqlEventSource(event);
        if (investigationId) {
            latestSqlEventByInvestigationId.set(investigationId, event);
        }
    }

    const findings = [];
    for (const investigationId of missingInvestigationIds) {
        const investigation = investigationsById.get(investigationId);
        const sourceEvent = latestSqlEventByInvestigationId.get(investigationId) ?? null;
        const source = extractSqlEventSource(sourceEvent);
        const title = investigation?.title?.trim() || 'Analysis';
        const content = sourceEvent
            ? fallbackFindingContentFromSqlEvent(sourceEvent)
            : `No SQL-backed Finding was produced for "${title}" before the Agent attempted the conclusion. Treat this Analysis as inconclusive and do not use it as supporting evidence.`;
        const whyItMatters = sourceEvent
            ? fallbackWhyItMattersFromSqlEvent(sourceEvent)
            : 'This Analysis lacks SQL-backed evidence and should not increase confidence in the conclusion.';
        const finding = await params.db.works.createInvestigationFinding({
            organizationId: params.organizationId,
            workId: params.workId,
            investigationId,
            content,
            whyItMatters,
            sourceTabId: source.tabId,
            sourceRunEventId: sourceEvent?.id ?? null,
            createdBy: 'agent',
        });

        applyWorkAgentProtocolResult(params.protocol, 'work_createInvestigationFinding', finding);
        await params.appendEvent({
            type: 'investigation_updated',
            role: 'agent',
            content,
            payload: sanitizePayload({
                toolName: 'work_createInvestigationFinding',
                output: finding,
                whyItMatters,
                fallback: true,
                reason: params.reason,
            }),
        });
        findings.push(finding);
    }

    return findings;
}

function classifyWorkToolResult(toolName: string): { type: WorkRunEventType; content: string } {
    if (toolName === 'work_createInvestigation') {
        return { type: 'investigation_created', content: 'Analysis created' };
    }
    if (toolName === 'work_updateInvestigation' || toolName === 'work_createInvestigationFinding' || toolName === 'work_updateInvestigationFinding') {
        return { type: 'investigation_updated', content: 'Analysis updated' };
    }
    if (toolName === 'work_updateConclusion') {
        return { type: 'conclusion_updated', content: 'Conclusion updated' };
    }
    return { type: 'tool_result', content: `${toolName} completed` };
}

function workRunTools(tools: Record<string, any>) {
    const allowed = new Set(['work_createInvestigation', 'work_runInvestigationSql', 'work_createInvestigationFinding', 'work_updateInvestigation', 'work_updateConclusion']);
    return Object.fromEntries(Object.entries(tools).filter(([toolName]) => allowed.has(toolName)));
}

function workWorkspaceRunTools(tools: Record<string, unknown>) {
    const allowed = new Set(['work_createMessage', 'work_createSqlTab', 'work_updateSqlTab', 'work_executeSqlTab', 'work_markDone', 'work_getWorkspace']);
    return Object.fromEntries(Object.entries(tools).filter(([toolName]) => allowed.has(toolName)));
}

function withWorkWorkspaceContext(input: unknown, params: { toolName: string; workId: string; runId: string; focusTabId?: string | null }) {
    const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    if (params.toolName === 'work_getWorkspace') {
        return {
            ...record,
            workId: params.workId,
        };
    }

    return {
        ...record,
        workId: params.workId,
        runId: params.runId,
        tabId:
            typeof record.tabId === 'string' && record.tabId
                ? record.tabId
                : params.toolName === 'work_executeSqlTab' || params.toolName === 'work_updateSqlTab'
                  ? (params.focusTabId ?? undefined)
                  : undefined,
    };
}

function toolOutputError(output: unknown) {
    const record = output && typeof output === 'object' && !Array.isArray(output) ? (output as Record<string, unknown>) : null;
    if (record?.ok !== false) return null;
    const error = record.error && typeof record.error === 'object' && !Array.isArray(record.error) ? (record.error as Record<string, unknown>) : null;
    const message = typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : 'Workspace tool failed.';
    return message;
}

function isMeaningfulWorkRunSqlTab(tab: UITabPayload) {
    if (tab.tabType !== 'sql') return false;
    if (tab.content?.trim()) return true;
    if (tab.resultMeta?.sessionId || tab.sessionId) return true;
    if (tab.resultMeta?.source === 'work-run') return true;
    if (tab.lastAgentRunId || tab.lastAgentEventId || tab.lastAgentSyncedAt) return true;
    return false;
}

function wrapWorkspaceToolsWithRunEvents(params: {
    tools: Record<string, unknown>;
    workId: string;
    runId: string;
    focusTabId?: string | null;
    appendEvent: (event: {
        type: WorkRunEventType;
        role: WorkRunEventRole;
        content?: string | null;
        payload?: Record<string, unknown> | null;
        createdAt?: string | Date | null;
    }) => Promise<void>;
}): ToolSet {
    return Object.fromEntries(
        Object.entries(params.tools).map(([toolName, definition]) => {
            const objectDefinition = definition && typeof definition === 'object' ? (definition as Record<string, unknown>) : null;
            const executeTool = objectDefinition?.execute;
            if (!objectDefinition || typeof executeTool !== 'function') {
                return [toolName, definition];
            }

            return [
                toolName,
                {
                    ...objectDefinition,
                    execute: async (input: unknown, options: unknown) => {
                        const executionInput = withWorkWorkspaceContext(input, {
                            toolName,
                            workId: params.workId,
                            runId: params.runId,
                            focusTabId: params.focusTabId,
                        });
                        await params.appendEvent({
                            type: 'tool_call',
                            role: 'tool',
                            content: `${toolName} called`,
                            payload: sanitizePayload({ toolName, input: executionInput }),
                        });

                        try {
                            const output = await executeTool(executionInput, options);
                            const outputError = toolOutputError(output);
                            if (outputError) {
                                await params.appendEvent({
                                    type: 'error',
                                    role: 'tool',
                                    content: outputError,
                                    payload: sanitizePayload({ toolName, input: executionInput, output }),
                                });
                                return output;
                            }
                            await params.appendEvent({
                                type: 'tool_result',
                                role: 'tool',
                                content: toMessageContent(output, `${toolName} completed`),
                                payload: sanitizePayload({ toolName, output }),
                            });
                            return output;
                        } catch (error) {
                            await params.appendEvent({
                                type: 'error',
                                role: 'tool',
                                content: error instanceof Error ? error.message : String(error ?? `${toolName} failed`),
                                payload: sanitizePayload({ toolName, error }),
                            });
                            throw error;
                        }
                    },
                },
            ];
        }),
    ) as ToolSet;
}

function withWorkSqlContext(input: unknown, params: { toolName: string; workId: string; runId: string; investigationId?: string | null }) {
    if (params.toolName !== 'work_runInvestigationSql') return input;
    const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    return {
        ...record,
        workId: typeof record.workId === 'string' && record.workId ? record.workId : params.workId,
        investigationId: typeof record.investigationId === 'string' && record.investigationId ? record.investigationId : (params.investigationId ?? undefined),
        runId: params.runId,
    };
}

function withWorkFindingContext(
    input: unknown,
    params: {
        toolName: string;
        workId: string;
        pendingFinding: ReturnType<typeof createWorkAgentProtocolState>['pendingFinding'];
    },
) {
    if (params.toolName !== 'work_createInvestigationFinding') return input;
    const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    return {
        ...record,
        workId: typeof record.workId === 'string' && record.workId ? record.workId : params.workId,
        investigationId: typeof record.investigationId === 'string' && record.investigationId ? record.investigationId : params.pendingFinding?.investigationId,
        sourceTabId: typeof record.sourceTabId === 'string' && record.sourceTabId ? record.sourceTabId : (params.pendingFinding?.sourceTabId ?? undefined),
        sourceRunEventId: typeof record.sourceRunEventId === 'string' && record.sourceRunEventId ? record.sourceRunEventId : (params.pendingFinding?.sourceRunEventId ?? undefined),
    };
}

function wrapToolsWithRunEvents(params: {
    tools: Record<string, any>;
    db: DBService;
    organizationId: string;
    workId: string;
    runId: string;
    protocol: ReturnType<typeof createWorkAgentProtocolState>;
    onToolCallStart: (input: { toolName: string; toolCallId?: string | null; startedAt: Date }) => void;
    appendEvent: (event: {
        type: WorkRunEventType;
        role: WorkRunEventRole;
        content?: string | null;
        payload?: Record<string, unknown> | null;
        createdAt?: string | Date | null;
    }) => Promise<void>;
}): ToolSet {
    const waitForInvestigation = async () => {
        if (params.protocol.currentInvestigationId) return;
        const deadline = Date.now() + 800;
        while (!params.protocol.currentInvestigationId && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    };

    return Object.fromEntries(
        Object.entries(params.tools).map(([toolName, definition]) => {
            if (!definition || typeof definition.execute !== 'function') {
                return [toolName, definition];
            }

            return [
                toolName,
                {
                    ...definition,
                    execute: async (input: unknown, options: unknown) => {
                        if (toolName === 'work_runInvestigationSql' && !params.protocol.currentInvestigationId) {
                            await waitForInvestigation();
                        }

                        const sqlInput = withWorkSqlContext(input, {
                            toolName,
                            workId: params.workId,
                            runId: params.runId,
                            investigationId: params.protocol.currentInvestigationId,
                        });
                        const executionInput = withWorkFindingContext(sqlInput, {
                            toolName,
                            workId: params.workId,
                            pendingFinding: params.protocol.pendingFinding,
                        });
                        if (toolName === 'work_updateConclusion') {
                            if (params.protocol.pendingFinding) {
                                await createFallbackFindingForPendingSql({
                                    db: params.db,
                                    organizationId: params.organizationId,
                                    workId: params.workId,
                                    protocol: params.protocol,
                                    appendEvent: params.appendEvent,
                                });
                            }
                            await createFallbackFindingsForMissingAnalyses({
                                db: params.db,
                                organizationId: params.organizationId,
                                workId: params.workId,
                                runId: params.runId,
                                protocol: params.protocol,
                                appendEvent: params.appendEvent,
                                reason: 'Agent attempted to update the conclusion before every Analysis had a Finding.',
                            });
                        }
                        const protocolDecision = checkWorkAgentProtocol(params.protocol, toolName, executionInput);
                        if (!protocolDecision.allowed) {
                            const output = workAgentProtocolError(protocolDecision.message);
                            await params.appendEvent({
                                type: 'tool_result',
                                role: 'system',
                                content: `Protocol reminder: ${protocolDecision.message}`,
                                payload: sanitizePayload({ toolName, input: executionInput, protocol: params.protocol }),
                            });
                            return output;
                        }

                        const toolOptions = options && typeof options === 'object' ? (options as Record<string, unknown>) : {};
                        const toolCallId = typeof toolOptions.toolCallId === 'string' ? toolOptions.toolCallId : null;
                        params.onToolCallStart({ toolName, toolCallId, startedAt: new Date() });

                        await params.appendEvent({
                            type: 'tool_call',
                            role: 'tool',
                            content: `${toolName} called`,
                            payload: sanitizePayload({ toolName, input: executionInput }),
                        });

                        try {
                            const output = await definition.execute(executionInput, options);
                            applyWorkAgentProtocolResult(params.protocol, toolName, output);
                            const classified = classifyWorkToolResult(toolName);
                            await params.appendEvent({
                                type: classified.type,
                                role: 'tool',
                                content: toWorkToolEventContent(toolName, executionInput, output, classified.content),
                                payload: sanitizePayload({ toolName, output }),
                            });
                            return output;
                        } catch (error) {
                            await params.appendEvent({
                                type: 'error',
                                role: 'tool',
                                content: error instanceof Error ? error.message : String(error ?? `${toolName} failed`),
                                payload: sanitizePayload({ toolName, error }),
                            });
                            throw error;
                        }
                    },
                },
            ];
        }),
    ) as ToolSet;
}

async function createWorkAgentActionContext(options: RunWorkAgentOptions & { requestId: string; currentConnectionId: string | null }): Promise<ActionContext<WebActionServices>> {
    const access = await resolveOrganizationAccess(options.organizationId, options.userId);
    if (!access?.isMember) {
        throw new Error('User does not have access to this organization.');
    }

    return {
        organizationId: options.organizationId,
        userId: options.userId,
        currentConnectionId: options.currentConnectionId,
        locale: await getApiLocale(),
        runtime: getRuntimeForServer(),
        access,
        actor: {
            type: 'agent',
            scopes: AGENT_SCOPES,
            id: options.userId,
        },
        requestId: `${options.requestId}:${randomUUID()}`,
        audit: createWebActionAuditSink(options.db),
        services: {
            db: options.db,
            req: options.req as any,
        },
    };
}

function formatWorkSetupSection(work: { id: string; workType?: string | null; scope?: unknown; initialContext?: string | null }) {
    const workTypeLabels: Record<string, string> = {
        investigation: 'Investigation: find the cause, build an evidence chain, and write a clear conclusion.',
        analysis: 'Analysis: compare metrics, trends, and segments, then explain the important movement.',
        monitoring: 'Monitoring: inspect the current state, define what to watch, and identify sustained changes.',
        data_qa: 'Data QA: check data quality, anomalies, missingness, duplicates, and reliability risks.',
        sql_workspace: 'SQL Workspace: start from SQL exploration while still preserving findings and a final conclusion.',
    };
    const normalizedWorkType = work.workType ?? 'investigation';
    const scope = work.scope && typeof work.scope === 'object' && !Array.isArray(work.scope) ? (work.scope as Record<string, unknown>) : null;
    const lines = ['Work Setup', `Work type: ${workTypeLabels[normalizedWorkType] ?? workTypeLabels.investigation}`];

    if (scope) {
        const timeRange = typeof scope.timeRange === 'string' && scope.timeRange.trim() ? scope.timeRange.trim() : null;
        const tablesMode = typeof scope.tablesMode === 'string' && scope.tablesMode.trim() ? scope.tablesMode.trim() : null;
        const selectedTables = Array.isArray(scope.selectedTables) ? scope.selectedTables.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
        const metrics = Array.isArray(scope.metrics) ? scope.metrics.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
        const constraints = Array.isArray(scope.constraints) ? scope.constraints.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];

        if (timeRange) lines.push(`Time range: ${timeRange}`);
        if (tablesMode) lines.push(`Tables: ${tablesMode === 'selected' && selectedTables.length ? selectedTables.join(', ') : tablesMode}`);
        if (metrics.length) lines.push(`Metrics: ${metrics.join(', ')}`);
        if (constraints.length) {
            lines.push('Constraints:');
            for (const constraint of constraints) {
                lines.push(`- ${constraint}`);
            }
        }
    }

    if (work.initialContext?.trim()) {
        lines.push('Additional context:');
        lines.push(work.initialContext.trim());
    }

    return lines.join('\n');
}

const WORK_TOOL_BOUNDARY_INSTRUCTION = [
    'Work Tool Boundary',
    'Only call these Work tools by their exact tool names: work_createInvestigation, work_runInvestigationSql, work_createInvestigationFinding, work_updateInvestigation, work_updateConclusion.',
    'Do not call describeTable, searchSchema, listTables, listDatabases, getTableProfile, getDatabaseSummary, sqlRunner, or any other generic chat/schema/sql tool; they are not available in Work runs.',
    'If table or column metadata is needed, query metadata with work_runInvestigationSql using a read-only SQL statement appropriate for the database dialect, then create a Finding from the SQL result before running another query.',
    'All business-data and metadata queries must go through work_runInvestigationSql so the SQL, result, and Analysis evidence remain auditable in the Work workspace.',
].join('\n');

function workToolBoundaryInstruction() {
    return WORK_TOOL_BOUNDARY_INSTRUCTION;
}

function buildWorkRunInstruction(
    work: { id: string; workType?: string | null; scope?: unknown; initialContext?: string | null },
    workspaceSnapshot: WorkWorkspaceSnapshot | null,
    existingAnalyses: ExistingRunAnalysis[],
    focusedAnalysis: WorkInvestigation | null,
    mode: WorkRunMode,
    userInstruction: string | null,
) {
    const userInstructionSection = userInstruction?.trim() ? ['Human instruction', userInstruction.trim()].join('\n') : null;

    if (mode === 'update_conclusion') {
        return [
            'Work Run Context',
            `You are updating the conclusion for Dory Work ${work.id}.`,
            workToolBoundaryInstruction(),
            formatWorkSetupSection(work),
            existingAnalysesForPrompt(existingAnalyses),
            'Only update the Work conclusion from the current included Analysis Findings.',
            'Do not run SQL, create analyses, or change analysis review status.',
            'Call work.updateConclusion with a concise synthesis of included Findings and conclusionMetadata containing confidence, caveats, and recommendedNextStep.',
            userInstructionSection,
        ]
            .filter(Boolean)
            .join('\n');
    }

    if (workspaceSnapshot) {
        return [
            'Work Run Context',
            `You are continuing a Dory Work. The current workId is ${work.id}.`,
            `Continue only the current Investigation. The current investigationId is ${workspaceSnapshot.investigationId}.`,
            workToolBoundaryInstruction(),
            formatWorkSetupSection(work),
            'The human has already reviewed and modified the SQL workspace. Treat the Workspace Snapshot in the user message as the source of truth for the next step.',
            'Do not create new analyses for this continuation unless the human explicitly asks for a broader Work restart.',
            'You may create a Finding from the provided snapshot result and run follow-up SQL through work.runInvestigationSql for this same investigationId.',
            'Do not update the Work conclusion. The UI will mark it outdated and the human can update it explicitly.',
            'When calling work.runInvestigationSql, use the investigationId from this continuation and preserve the human-edited SQL intent unless you explain the change.',
            'Use a distinct groupKey for each distinct SQL purpose and pass a concise per-query title for the SQL Purpose. Reuse a groupKey only when the SQL should be appended to the same workspace tab as the previous query.',
            'Write SQL as a complete statement ending with a semicolon.',
            'Run SQL only through work.runInvestigationSql so the SQL workspace tab and result are preserved. Do not use any direct query or tab tools.',
            'Keep the final answer concise and focused on what changed after the human handoff.',
            userInstructionSection,
        ]
            .filter(Boolean)
            .join('\n');
    }

    if (focusedAnalysis) {
        return [
            'Work Run Context',
            `You are running a Dory Work. The current workId is ${work.id}.`,
            workToolBoundaryInstruction(),
            formatWorkSetupSection(work),
            focusedAnalysisForPrompt(focusedAnalysis),
            'The user just added this Analysis. Start running it now.',
            'This is a task-style focused continuation. Do not call work.createInvestigation.',
            'Only update the focused Analysis listed above. Reuse its exact investigationId when running SQL and creating Findings.',
            'If the human instruction changes the analysis title, call work.updateInvestigation with the focused investigationId and the new title.',
            'Run follow-up SQL through work.runInvestigationSql for the focused investigationId. Do not invent or infer IDs from titles.',
            'After every SQL run, create at least one Finding for this same Analysis before running another SQL query or writing the conclusion.',
            'When calling work.runInvestigationSql, use a distinct groupKey for each distinct SQL purpose and pass a concise per-query title for the SQL Purpose. Reuse a groupKey only when the SQL should be appended to the same workspace tab as the previous query.',
            'Write SQL as a complete statement ending with a semicolon.',
            mode === 'revise_analysis'
                ? 'Do not update the Work conclusion. The UI will mark it outdated and the human can update it explicitly.'
                : 'Call work.updateConclusion after the focused included Analysis has SQL-backed Findings. Include conclusionMetadata with confidence, caveats, and recommendedNextStep. Human confirmation is optional and should not block the conclusion.',
            'Run SQL only through work.runInvestigationSql so the SQL workspace tab and result are preserved. Do not use any direct query or tab tools.',
            'Before each tool call, briefly state what you are about to do. Keep that explanation close to the step.',
            'Keep the final answer concise. Do not repeat the full step-by-step process in the final answer.',
            userInstructionSection,
        ]
            .filter(Boolean)
            .join('\n');
    }

    if (existingAnalyses.length > 0) {
        return [
            'Work Run Context',
            `You are running a Dory Work. The current workId is ${work.id}.`,
            workToolBoundaryInstruction(),
            formatWorkSetupSection(work),
            existingAnalysesForPrompt(existingAnalyses),
            'This is a task-style continuation. The Work already has Analyses, so do not call work.createInvestigation.',
            'Only update the existing Analyses listed above. Reuse their exact investigationId values when running SQL and creating Findings.',
            mode === 'continue_work' ? 'Decide which listed Analyses are affected by the human instruction. Only run SQL and create Findings for affected Analyses.' : null,
            'Run follow-up SQL through work.runInvestigationSql using one of the active investigationId values. Do not invent or infer IDs from titles.',
            'After every SQL run, create at least one Finding for the same Analysis before running another SQL query, switching Analysis, or writing the conclusion.',
            'When calling work.runInvestigationSql, use a distinct groupKey for each distinct SQL purpose and pass a concise per-query title for the SQL Purpose. Reuse a groupKey only when the new SQL belongs in the same workspace tab as prior SQL for that Analysis.',
            'Write SQL as a complete statement ending with a semicolon.',
            'Every included non-rejected Analysis must have at least one Finding before the conclusion.',
            mode === 'continue_work'
                ? 'Call work.updateConclusion after affected included Analyses have Findings. Include conclusionMetadata with confidence, caveats, and recommendedNextStep. The conclusion must synthesize the updated included Findings and should not simply repeat every Finding.'
                : 'Call work.updateConclusion after included Analyses have Findings. Include conclusionMetadata with confidence, caveats, and recommendedNextStep. The conclusion must synthesize included Findings and should not simply repeat every Finding.',
            'Run SQL only through work.runInvestigationSql so the SQL workspace tab and result are preserved. Do not use any direct query or tab tools.',
            'Use work.createInvestigationFinding after SQL results. Every Finding must include content and a short whyItMatters sentence explaining how the result affects the Work goal. Users can later confirm or exclude individual Analyses.',
            'Before each tool call, briefly state what you are about to do. Keep that explanation close to the step.',
            'Keep the final answer concise. Do not repeat the full step-by-step process in the final answer.',
            userInstructionSection,
        ]
            .filter(Boolean)
            .join('\n');
    }

    return [
        'Work Run Context',
        `You are running a Dory Work. The current workId is ${work.id}.`,
        workToolBoundaryInstruction(),
        formatWorkSetupSection(work),
        'Follow this protocol exactly: first create 3-5 distinct analyses with work.createInvestigation, then run SQL for each analysis with work.runInvestigationSql, then create concrete Findings with work.createInvestigationFinding, then update the conclusion from included Analyses.',
        'Call exactly one protocol tool at a time. Do not call work.runInvestigationSql in the same step as work.createInvestigation.',
        'Create all analyses before running any SQL. Use focused titles such as revenue trend analysis, order status analysis, order amount anomaly analysis, and time-based anomaly analysis.',
        'Let the Work type and Scope guide the analysis titles, SQL exploration order, and conclusion structure.',
        'Respect user constraints. If a requested step conflicts with a constraint, explain the conflict and choose the safer read-only path.',
        'After every SQL run, create at least one Finding for the same Analysis before running another SQL query, switching Analysis, or writing the conclusion.',
        'When calling work.runInvestigationSql, always pass the target investigationId from the Analysis you created, a stable groupKey for the human-readable SQL asset group, and a concise per-query title for the SQL Purpose. Use a distinct groupKey for each distinct SQL purpose. Reuse a groupKey only when the new SQL belongs in the same workspace tab as prior SQL for that Analysis.',
        'Write SQL as a complete statement ending with a semicolon.',
        'A Finding is a concise fact or observation backed by the SQL result. Prefer bullet-like short statements, not a long summary paragraph.',
        'Every Finding must include content and a short whyItMatters sentence explaining how the result affects the Work goal.',
        'Every included non-rejected Analysis must have at least one Finding before the conclusion.',
        'Call work.updateConclusion after included Analyses have Findings. Include conclusionMetadata with confidence, caveats, and recommendedNextStep. Human confirmation is optional and should not block the conclusion.',
        'Run SQL only through work.runInvestigationSql so the SQL workspace tab and result are preserved. Do not use any direct query or tab tools.',
        'Use work.createInvestigationFinding after SQL results. Users can later confirm or exclude individual Analyses.',
        'Before each tool call, briefly state what you are about to do. Keep that explanation close to the step.',
        'Use your own exploration notes in those step messages. Do not use generic server progress templates.',
        'Keep the final answer concise. Do not repeat the full step-by-step process in the final answer.',
        userInstructionSection,
    ]
        .filter(Boolean)
        .join('\n');
}

function buildWorkWorkspaceRunInstruction(input: {
    work: { id: string; workType?: string | null; scope?: unknown; initialContext?: string | null };
    workspaceContext: string | null;
    userInstruction: string | null;
    focusTabId?: string | null;
    trigger?: string | null;
}) {
    const userInstructionSection = input.userInstruction?.trim() ? ['Human instruction', input.userInstruction.trim()].join('\n') : null;
    return [
        'Dory Work Workspace Protocol',
        `You are operating Dory Work ${input.work.id}.`,
        'Dory Work is not a chatbot, notebook, or structured Analysis workflow. Your job is to operate the SQL workspace.',
        'Only call these Work tools by their exact tool names: work_getWorkspace, work_createMessage, work_createSqlTab, work_updateSqlTab, work_executeSqlTab, work_markDone.',
        'Do not call Analysis, Finding, Evidence, Conclusion, or Investigation tools for this Work run.',
        'Use work_getWorkspace when you need the current tabs and sync state.',
        'Use work_createSqlTab for a new SQL purpose. Use work_updateSqlTab when modifying an existing tab. Use work_executeSqlTab to run a tab and preserve the result.',
        'For a new Work with no meaningful SQL tab, your first workspace-changing tool call must be work_createSqlTab with a clear title and a complete non-empty SQL statement. The sql field must not be empty and must not be placeholder text.',
        'After creating or updating a SQL tab, call work_executeSqlTab for that same tab before calling work_markDone unless the human explicitly asks you only to draft SQL.',
        'Never call work_markDone until at least one Work SQL tab contains non-empty SQL that directly addresses the human instruction or Work goal.',
        'If the human continued from a focused tab, prioritize that tab before creating new tabs.',
        input.focusTabId ? `Focused tab ID: ${input.focusTabId}` : null,
        input.trigger ? `Run trigger: ${input.trigger}` : null,
        formatWorkSetupSection(input.work),
        input.workspaceContext,
        'Before tool calls, briefly state the workspace action you are taking. Keep messages short and operational.',
        'Finish by calling work_markDone with a concise summary of what changed in the workspace.',
        userInstructionSection,
    ]
        .filter(Boolean)
        .join('\n');
}
function extractResponseText(message: unknown): string | null {
    const record = message && typeof message === 'object' && !Array.isArray(message) ? (message as Record<string, unknown>) : null;
    const parts = record?.parts;
    if (!Array.isArray(parts)) return null;
    const text = parts
        .map(part => (part && typeof part === 'object' && !Array.isArray(part) ? (part as Record<string, unknown>) : null))
        .filter((part): part is Record<string, unknown> => part?.type === 'text' && typeof part.text === 'string')
        .map(part => String(part.text).trim())
        .filter(Boolean)
        .join('\n\n')
        .trim();
    return text || null;
}

function extractFinishEventText(event: { responseMessage?: unknown; text?: unknown }) {
    return extractResponseText(event.responseMessage) ?? (typeof event.text === 'string' ? event.text : null);
}

export async function runWorkAgent(options: RunWorkAgentOptions): Promise<Response> {
    const startedAt = Date.now();
    const requestId = createAiRequestId();
    const locale = await getApiLocale();
    const mode = options.mode ?? 'run';
    const userInstruction = options.userInstruction?.trim() || null;
    const work = await options.db.works.getById({ organizationId: options.organizationId, id: options.workId });

    if (!work) {
        return Response.json({ error: 'Work not found.' }, { status: 404 });
    }

    const workspaceSnapshot = options.workspaceSnapshotId
        ? await options.db.works.getWorkspaceSnapshotById({
              organizationId: options.organizationId,
              workId: work.id,
              id: options.workspaceSnapshotId,
          })
        : null;

    if (options.workspaceSnapshotId && !workspaceSnapshot) {
        return Response.json({ error: 'Workspace snapshot not found.' }, { status: 404 });
    }

    const focusedAnalysis =
        !workspaceSnapshot && options.focusInvestigationId
            ? await options.db.works.getInvestigationById({
                  organizationId: options.organizationId,
                  workId: work.id,
                  id: options.focusInvestigationId,
              })
            : null;

    if (options.focusInvestigationId && !focusedAnalysis) {
        return Response.json({ error: 'Focused Analysis not found.' }, { status: 404 });
    }

    const workspaceSnapshotContext = formatWorkspaceSnapshotForAgent(workspaceSnapshot);
    const workInvestigations = await options.db.works.listInvestigations({
        organizationId: options.organizationId,
        workId: work.id,
    });
    const workFindings = await options.db.works.listFindingsForWork({
        organizationId: options.organizationId,
        workId: work.id,
    });
    const workRunEvents = await options.db.works.listRunEvents({
        organizationId: options.organizationId,
        workId: work.id,
    });
    const initialFindingCountsByInvestigationId = countFindingsByInvestigation(workFindings);
    const selectedExistingRunAnalyses =
        workspaceSnapshot || focusedAnalysis
            ? []
            : selectExistingRunAnalyses({
                  investigations: workInvestigations,
                  findings: workFindings,
                  runEvents: workRunEvents,
              });
    const resetInvestigationIds =
        workspaceSnapshot || mode === 'revise_analysis'
            ? [workspaceSnapshot?.investigationId ?? focusedAnalysis?.id].filter((id): id is string => Boolean(id))
            : mode === 'run' || mode === 'rerun_from_scratch'
              ? activeInvestigationIds(workInvestigations)
              : [];
    const requiresConclusion = mode !== 'revise_analysis' && !workspaceSnapshot;
    const shouldRecordRunRevisions = Boolean(workspaceSnapshot) || mode === 'continue_work' || mode === 'revise_analysis';
    const existingRunAnalyses = resetInvestigationIds.length > 0 && mode !== 'update_conclusion' ? resetFindingCounts(selectedExistingRunAnalyses) : selectedExistingRunAnalyses;

    const { run, existingRunningRun } = await options.db.works.createRun({
        workId: work.id,
        organizationId: options.organizationId,
        connectionId: work.connectionId,
        createdByUserId: options.userId,
    });

    if (existingRunningRun) {
        return Response.json(
            {
                error: 'Work already has a running run.',
                run: existingRunningRun,
            },
            {
                status: 409,
                headers: {
                    'x-work-run-id': existingRunningRun.id,
                },
            },
        );
    }

    const appendEvent = async (event: {
        type: WorkRunEventType;
        role: WorkRunEventRole;
        content?: string | null;
        payload?: Record<string, unknown> | null;
        createdAt?: string | Date | null;
    }) => {
        await options.db.works.appendRunEvent({
            runId: run.id,
            workId: work.id,
            organizationId: options.organizationId,
            type: event.type,
            role: event.role,
            content: event.content ?? null,
            payload: event.payload ?? null,
            createdAt: event.createdAt ?? null,
        });
    };

    await appendEvent({
        type: 'message',
        role: 'user',
        content: [workspaceSnapshotContext ?? work.goal, userInstruction ? `Human instruction: ${userInstruction}` : null].filter(Boolean).join('\n\n'),
        payload: {
            workId: work.id,
            connectionId: work.connectionId,
            workType: work.workType,
            scope: work.scope,
            initialContext: work.initialContext,
            mode,
            userInstruction,
            workspaceSnapshotId: workspaceSnapshot?.id ?? null,
            investigationId: workspaceSnapshot?.investigationId ?? focusedAnalysis?.id ?? null,
        },
    });
    await appendEvent({
        type: 'message',
        role: 'system',
        content: 'Agent run started',
        payload: {
            runId: run.id,
        },
    });

    const useWorkWorkspaceProtocol =
        !focusedAnalysis && mode !== 'update_conclusion' && mode !== 'revise_analysis' && (!workspaceSnapshot || workspaceSnapshot.intent !== 'continue_analysis');

    if (useWorkWorkspaceProtocol) {
        try {
            const execution = await resolveAiRouteExecution({
                req: options.req,
                db: options.db,
                organizationId: options.organizationId,
                role: 'chat',
                requestedModel: null,
                includeModel: true,
            });
            const preset = execution.preset;
            const compiledSystem = compileSystemPrompt(preset.system);
            const entitlements = await resolveAiEntitlements({
                organizationId: options.organizationId,
                userId: options.userId,
                feature: 'chat_agent',
            });
            assertAiQuotaAllowed(entitlements.quota);

            const workspaceScope = { type: 'work' as const, workId: work.id };
            const workspaceTabs = (await options.db.tabState.loadAllTab(options.userId, work.connectionId, workspaceScope)) as unknown as UITabPayload[];
            const workspaceContext = [
                'Current SQL Workspace',
                `Workspace ID: ${workspaceScopeKey(workspaceScope)}`,
                workspaceTabs.length
                    ? workspaceTabs
                          .map((tab, index) => {
                              const resultMeta = tab.tabType === 'sql' && tab.resultMeta && typeof tab.resultMeta === 'object' ? tab.resultMeta : null;
                              const rows = typeof resultMeta?.rows === 'number' ? `${resultMeta.rows} rows` : 'no result rows';
                              const columns = typeof resultMeta?.columns === 'number' ? `${resultMeta.columns} columns` : 'unknown columns';
                              const syncState = typeof tab.workSyncState === 'string' ? tab.workSyncState : 'synced';
                              return `${index + 1}. tabId=${tab.tabId}; title=${tab.tabName ?? 'Untitled SQL tab'}; status=${syncState}; result=${rows}, ${columns}`;
                          })
                          .join('\n')
                    : 'No SQL tabs exist yet.',
            ].join('\n');

            const tools = workWorkspaceRunTools({
                ...createDoryChatTools({
                    userId: options.userId,
                    organizationId: options.organizationId,
                    currentConnectionId: work.connectionId,
                    locale,
                }),
            });
            const wrappedTools = wrapWorkspaceToolsWithRunEvents({
                tools,
                workId: work.id,
                runId: run.id,
                focusTabId: options.focusTabId ?? workspaceSnapshot?.workspaceId ?? null,
                appendEvent,
            });
            const agentContext = await buildDoryAgentContext({
                baseSystem: compiledSystem ?? '',
                userLanguageInstruction: buildUserLanguageInstruction(userInstruction ?? work.goal, locale),
                userId: options.userId,
                organizationId: options.organizationId,
                connectionId: work.connectionId,
                database: null,
                activeSchema: null,
                table: null,
                tableSchema: null,
                connectionType: null,
                sqlToolEnabled: false,
                candidateTables: null,
                copilotEnvelope: null,
                locale,
            });
            const agentInstructions = [
                agentContext.instructions,
                buildWorkWorkspaceRunInstruction({
                    work,
                    workspaceContext: [workspaceContext, workspaceSnapshotContext].filter(Boolean).join('\n\n') || null,
                    userInstruction,
                    focusTabId: options.focusTabId ?? workspaceSnapshot?.workspaceId ?? null,
                    trigger: options.trigger,
                }),
            ]
                .filter(Boolean)
                .join('\n\n');
            const model = resolveDoryAgentModel({
                execution,
                req: options.req,
            });
            const gatewayHeaders = buildCloudflareAiGatewayHeaders(
                {
                    organizationId: options.organizationId,
                    userId: options.userId,
                    userEmail: entitlements.userEmail,
                    plan: entitlements.plan,
                    feature: 'chat_agent',
                },
                execution.gateway,
            );
            const headers = mergeHeaders(undefined, gatewayHeaders);
            const uiMessages: UIMessage[] = [
                {
                    id: `work-run-${run.id}`,
                    role: 'user',
                    parts: [
                        {
                            type: 'text',
                            text: [work.goal, workspaceSnapshotContext, userInstruction ? `Human instruction: ${userInstruction}` : null].filter(Boolean).join('\n\n'),
                        },
                    ],
                } as UIMessage,
            ];
            let modelStepMessageCount = 0;

            const agent = buildDoryChatAgent({
                model,
                tools: wrappedTools,
                instructions: agentInstructions,
                temperature: preset.temperature,
                maxSteps: 18,
                headers,
                context: {
                    organizationId: options.organizationId,
                    userId: options.userId,
                    userEmail: entitlements.userEmail,
                    plan: entitlements.plan,
                    feature: 'chat_agent',
                    model: execution.modelName,
                    requestId,
                    connectionId: work.connectionId,
                    gateway: execution.gateway,
                    provider: execution.providerKey,
                },
                requestId,
                startedAt,
                debugInput: {
                    system: agentInstructions,
                    messages: uiMessages as never,
                    prompt: null,
                },
            });

            return await createAgentUIStreamResponse({
                agent,
                uiMessages: uiMessages as never,
                originalMessages: uiMessages as never,
                generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 }),
                headers: {
                    'x-work-run-id': run.id,
                },
                onStepFinish: async step => {
                    const text = step.text?.trim();
                    if (!text || step.toolCalls.length === 0) return;
                    modelStepMessageCount += 1;
                    await appendEvent({
                        type: 'message',
                        role: 'agent',
                        content: text,
                        payload: sanitizePayload({
                            stepNumber: step.stepNumber,
                            toolCalls: step.toolCalls.map(toolCall => ({
                                toolCallId: toolCall.toolCallId,
                                toolName: toolCall.toolName,
                            })),
                        }),
                    });
                },
                onFinish: async event => {
                    if (event.isAborted) {
                        await appendEvent({
                            type: 'error',
                            role: 'system',
                            content: 'Agent run aborted',
                            payload: { finishReason: event.finishReason ?? null },
                        });
                        await options.db.works.failRun({
                            organizationId: options.organizationId,
                            workId: work.id,
                            id: run.id,
                            error: 'Agent run aborted.',
                        });
                        return;
                    }

                    const text = extractFinishEventText(event);
                    if (text && modelStepMessageCount === 0) {
                        await appendEvent({
                            type: 'message',
                            role: 'agent',
                            content: String(text),
                            payload: sanitizePayload({
                                finishReason: event.finishReason ?? null,
                            }),
                        });
                    }

                    const finalWorkspaceTabs = (await options.db.tabState.loadAllTab(options.userId, work.connectionId, {
                        type: 'work',
                        workId: work.id,
                    })) as unknown as UITabPayload[];
                    if (!finalWorkspaceTabs.some(isMeaningfulWorkRunSqlTab)) {
                        const message = 'Agent finished without creating any SQL workspace tabs.';
                        await appendEvent({
                            type: 'error',
                            role: 'system',
                            content: message,
                            payload: {
                                finishReason: event.finishReason ?? null,
                            },
                        });
                        await options.db.works.failRun({
                            organizationId: options.organizationId,
                            workId: work.id,
                            id: run.id,
                            error: message,
                        });
                        return;
                    }

                    await appendEvent({
                        type: 'completed',
                        role: 'system',
                        content: 'Agent run completed',
                        payload: {
                            finishReason: event.finishReason ?? null,
                        },
                    });
                    await options.db.works.completeRun({
                        organizationId: options.organizationId,
                        workId: work.id,
                        id: run.id,
                    });
                },
                onError: error => {
                    const message = error instanceof Error ? error.message : String(error ?? 'AI_SERVICE_UNAVAILABLE');
                    void appendEvent({
                        type: 'error',
                        role: 'system',
                        content: message,
                        payload: sanitizePayload({ error }),
                    }).then(() =>
                        options.db.works.failRun({
                            organizationId: options.organizationId,
                            workId: work.id,
                            id: run.id,
                            error: message,
                        }),
                    );

                    void recordAiUsage({
                        requestId,
                        context: {
                            organizationId: options.organizationId,
                            userId: options.userId,
                            feature: 'chat_agent',
                            model: execution.modelName,
                            requestId,
                            connectionId: work.connectionId,
                            gateway: execution.gateway,
                            provider: execution.providerKey,
                        },
                        input: {
                            system: agentContext.instructions,
                            messages: uiMessages as never,
                            prompt: null,
                        },
                        latencyMs: Date.now() - startedAt,
                        status: 'error',
                        error,
                    });

                    return message;
                },
            });
        } catch (error) {
            if (isAiQuotaExceededError(error)) {
                await options.db.works.failRun({
                    organizationId: options.organizationId,
                    workId: work.id,
                    id: run.id,
                    error: error.message,
                });
                await appendEvent({
                    type: 'error',
                    role: 'system',
                    content: error.message,
                    payload: sanitizePayload({ error }),
                });
                return toAiQuotaExceededResponse(error);
            }

            const message = isLocalMissingAiEnvError(error) ? 'MISSING_AI_ENV' : error instanceof Error ? error.message : 'Internal error';
            await options.db.works.failRun({
                organizationId: options.organizationId,
                workId: work.id,
                id: run.id,
                error: message,
            });
            await appendEvent({
                type: 'error',
                role: 'system',
                content: message,
                payload: sanitizePayload({ error }),
            });

            return new Response(message, {
                status: 500,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
        }
    }

    try {
        const execution = await resolveAiRouteExecution({
            req: options.req as any,
            db: options.db,
            organizationId: options.organizationId,
            role: 'chat',
            requestedModel: null,
            includeModel: true,
        });
        const preset = execution.preset;
        const compiledSystem = compileSystemPrompt(preset.system);
        const entitlements = await resolveAiEntitlements({
            organizationId: options.organizationId,
            userId: options.userId,
            feature: 'chat_agent',
        });
        assertAiQuotaAllowed(entitlements.quota);

        await resetWorkRunOutputs({
            db: options.db,
            organizationId: options.organizationId,
            workId: work.id,
            findings: workFindings,
            investigationIds: resetInvestigationIds,
            resetConclusion: requiresConclusion && mode !== 'update_conclusion' && mode !== 'continue_work',
        });

        const tools: Record<string, any> = workRunTools({
            chartBuilder: createChartBuilderTool(locale),
            ...createDoryChatTools({
                userId: options.userId,
                organizationId: options.organizationId,
                currentConnectionId: work.connectionId,
                locale,
            }),
        });

        const protocol = createWorkAgentProtocolState(
            workspaceSnapshot
                ? {
                      mode: 'investigation_continue',
                      investigationId: workspaceSnapshot.investigationId,
                      sourceTabId: workspaceSnapshot.workspaceId,
                      hasSnapshotResult: Boolean(workspaceSnapshot.humanEdits?.resultPreview),
                      existingAuditStatusByInvestigationId: workspaceSnapshot ? { [workspaceSnapshot.investigationId]: 'revised' } : undefined,
                      requireConclusion: requiresConclusion,
                  }
                : focusedAnalysis
                  ? {
                        mode: 'investigation_continue',
                        investigationId: focusedAnalysis.id,
                        sourceTabId: focusedAnalysis.linkedTabId,
                        hasSnapshotResult: false,
                        existingAuditStatusByInvestigationId: { [focusedAnalysis.id]: focusedAnalysis.auditStatus },
                        requireConclusion: requiresConclusion,
                    }
                  : {
                        existingInvestigationIds: existingRunAnalyses.map(analysis => analysis.id),
                        existingFindingsByInvestigationId: Object.fromEntries(existingRunAnalyses.map(analysis => [analysis.id, analysis.findingsCount])),
                        existingAuditStatusByInvestigationId: Object.fromEntries(existingRunAnalyses.map(analysis => [analysis.id, analysis.auditStatus])),
                        requireConclusion: requiresConclusion,
                    },
        );
        const toolCallStarts: Array<{ toolName: string; toolCallId: string | null; startedAt: Date; consumed: boolean }> = [];
        let modelStepMessageCount = 0;
        const wrappedTools = wrapToolsWithRunEvents({
            tools,
            db: options.db,
            organizationId: options.organizationId,
            workId: work.id,
            runId: run.id,
            protocol,
            onToolCallStart: event => {
                toolCallStarts.push({ ...event, toolCallId: event.toolCallId ?? null, consumed: false });
            },
            appendEvent,
        });
        const agentContext = await buildDoryAgentContext({
            baseSystem: compiledSystem ?? '',
            userLanguageInstruction: buildUserLanguageInstruction(userInstruction ?? work.goal, locale),
            userId: options.userId,
            organizationId: options.organizationId,
            connectionId: work.connectionId,
            database: null,
            activeSchema: null,
            table: null,
            tableSchema: null,
            connectionType: null,
            sqlToolEnabled: false,
            candidateTables: null,
            copilotEnvelope: null,
            locale,
        });
        const agentInstructions = [agentContext.instructions, buildWorkRunInstruction(work, workspaceSnapshot, existingRunAnalyses, focusedAnalysis, mode, userInstruction)]
            .filter(Boolean)
            .join('\n\n');
        const model = resolveDoryAgentModel({
            execution,
            req: options.req as any,
        });
        const gatewayHeaders = buildCloudflareAiGatewayHeaders(
            {
                organizationId: options.organizationId,
                userId: options.userId,
                userEmail: entitlements.userEmail,
                plan: entitlements.plan,
                feature: 'chat_agent',
            },
            execution.gateway,
        );
        const headers = mergeHeaders(undefined, gatewayHeaders);
        const uiMessages: UIMessage[] = [
            {
                id: `work-run-${run.id}`,
                role: 'user',
                parts: [
                    {
                        type: 'text',
                        text: [
                            workspaceSnapshotContext ? `${work.goal}\n\n${workspaceSnapshotContext}` : work.goal,
                            userInstruction ? `Human instruction: ${userInstruction}` : null,
                        ]
                            .filter(Boolean)
                            .join('\n\n'),
                    },
                ],
            } as UIMessage,
        ];

        const agent = buildDoryChatAgent({
            model,
            tools: wrappedTools,
            instructions: agentInstructions,
            temperature: preset.temperature,
            maxSteps: 18,
            headers,
            context: {
                organizationId: options.organizationId,
                userId: options.userId,
                userEmail: entitlements.userEmail,
                plan: entitlements.plan,
                feature: 'chat_agent',
                model: execution.modelName,
                requestId,
                connectionId: work.connectionId,
                gateway: execution.gateway,
                provider: execution.providerKey,
            },
            requestId,
            startedAt,
            debugInput: {
                system: agentInstructions,
                messages: uiMessages as any,
                prompt: null,
            },
        });

        return await createAgentUIStreamResponse({
            agent,
            uiMessages: uiMessages as any,
            originalMessages: uiMessages as any,
            generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 }),
            headers: {
                'x-work-run-id': run.id,
            },
            onStepFinish: async step => {
                const text = step.text?.trim();
                if (!text || step.toolCalls.length === 0) return;

                const toolCallIds = new Set(step.toolCalls.map(toolCall => toolCall.toolCallId).filter(Boolean));
                const toolNames = new Set(step.toolCalls.map(toolCall => toolCall.toolName).filter(Boolean));
                const match = toolCallStarts.find(start => !start.consumed && ((start.toolCallId && toolCallIds.has(start.toolCallId)) || toolNames.has(start.toolName)));
                if (match) match.consumed = true;

                modelStepMessageCount += 1;
                await appendEvent({
                    type: 'message',
                    role: 'agent',
                    content: text,
                    payload: sanitizePayload({
                        stepNumber: step.stepNumber,
                        toolCalls: step.toolCalls.map(toolCall => ({
                            toolCallId: toolCall.toolCallId,
                            toolName: toolCall.toolName,
                        })),
                    }),
                    createdAt: match ? new Date(match.startedAt.getTime() - 1) : null,
                });
            },
            onFinish: async event => {
                if (event.isAborted) {
                    await appendEvent({
                        type: 'error',
                        role: 'system',
                        content: 'Agent run aborted',
                        payload: { finishReason: event.finishReason ?? null },
                    });
                    await options.db.works.failRun({
                        organizationId: options.organizationId,
                        workId: work.id,
                        id: run.id,
                        error: 'Agent run aborted.',
                    });
                    return;
                }

                const text = extractResponseText((event as any).responseMessage) ?? ((event as any).text ? String((event as any).text) : null);
                if (text && modelStepMessageCount === 0) {
                    await appendEvent({
                        type: 'message',
                        role: 'agent',
                        content: String(text),
                        payload: sanitizePayload({
                            finishReason: event.finishReason ?? null,
                        }),
                    });
                }

                if (protocol.pendingFinding) {
                    await createFallbackFindingForPendingSql({
                        db: options.db,
                        organizationId: options.organizationId,
                        workId: work.id,
                        protocol,
                        appendEvent,
                    });
                }

                await createFallbackFindingsForMissingAnalyses({
                    db: options.db,
                    organizationId: options.organizationId,
                    workId: work.id,
                    runId: run.id,
                    protocol,
                    appendEvent,
                    reason: 'Agent finished before every Analysis had a Finding.',
                });

                const readyForFallbackConclusion =
                    protocol.requireConclusion &&
                    (protocol.mode === 'investigation_continue'
                        ? !protocol.pendingFinding &&
                          protocol.createdInvestigationIds.some(id => protocol.auditStatusByInvestigationId[id] !== 'rejected') &&
                          protocol.createdInvestigationIds.every(
                              id => protocol.auditStatusByInvestigationId[id] === 'rejected' || (protocol.findingsByInvestigationId[id] ?? 0) > 0,
                          )
                        : (protocol.existingInvestigationIds.length > 0 || protocol.createdInvestigationIds.length >= 3) &&
                          !protocol.pendingFinding &&
                          protocol.createdInvestigationIds.some(id => protocol.auditStatusByInvestigationId[id] !== 'rejected') &&
                          protocol.createdInvestigationIds.every(
                              id => protocol.auditStatusByInvestigationId[id] === 'rejected' || (protocol.findingsByInvestigationId[id] ?? 0) > 0,
                          ));
                if (readyForFallbackConclusion && !protocol.conclusionUpdated) {
                    const investigations = await options.db.works.listInvestigations({
                        organizationId: options.organizationId,
                        workId: work.id,
                    });
                    const findings = await options.db.works.listFindingsForWork({
                        organizationId: options.organizationId,
                        workId: work.id,
                    });
                    const conclusionInvestigationIds = new Set(protocol.createdInvestigationIds.filter(id => protocol.auditStatusByInvestigationId[id] !== 'rejected'));
                    const conclusionInvestigations = scopedInvestigationsForConclusion(investigations, conclusionInvestigationIds);
                    const fallbackConclusion = buildIncludedAnalysisConclusionFromFindings(
                        conclusionInvestigations,
                        scopedFindingsForConclusion(findings, conclusionInvestigationIds),
                    );
                    if (!fallbackConclusion) {
                        const completionMessage = 'Update the Work conclusion before completing the Work run.';
                        await appendEvent({
                            type: 'error',
                            role: 'system',
                            content: completionMessage,
                            payload: sanitizePayload({
                                finishReason: event.finishReason ?? null,
                                protocol,
                            }),
                        });
                        await options.db.works.failRun({
                            organizationId: options.organizationId,
                            workId: work.id,
                            id: run.id,
                            error: completionMessage,
                        });
                        return;
                    }

                    const ctx = await createWorkAgentActionContext({
                        ...options,
                        requestId,
                        currentConnectionId: work.connectionId,
                    });
                    const unconfirmedCount = conclusionInvestigations.filter(
                        investigation => investigation.auditStatus !== 'accepted' && investigation.auditStatus !== 'reviewed',
                    ).length;
                    const conclusionEnvelope = await executeAction(ctx, 'work.updateConclusion', {
                        workId: work.id,
                        conclusion: fallbackConclusion,
                        conclusionMetadata: buildFallbackConclusionMetadata({
                            includedCount: conclusionInvestigations.length,
                            unconfirmedCount,
                            fallback: true,
                        }),
                    });
                    applyWorkAgentProtocolResult(protocol, 'work_updateConclusion', conclusionEnvelope.data);
                    await appendEvent({
                        type: 'conclusion_updated',
                        role: 'agent',
                        content: fallbackConclusion,
                        payload: sanitizePayload({
                            toolName: 'work_updateConclusion',
                            output: conclusionEnvelope.data,
                            fallback: true,
                        }),
                    });
                }

                const completionDecision = checkWorkAgentProtocolComplete(protocol);
                if (!completionDecision.allowed) {
                    await appendEvent({
                        type: 'message',
                        role: 'system',
                        content: `Agent stopped before completing the Work protocol: ${completionDecision.message}`,
                        payload: sanitizePayload({
                            finishReason: event.finishReason ?? null,
                            protocol,
                        }),
                    });
                    await options.db.works.failRun({
                        organizationId: options.organizationId,
                        workId: work.id,
                        id: run.id,
                        error: completionDecision.message,
                    });
                    return;
                }

                if (shouldRecordRunRevisions) {
                    const revisionInvestigationIds =
                        workspaceSnapshot || focusedAnalysis
                            ? [workspaceSnapshot?.investigationId ?? focusedAnalysis?.id].filter((id): id is string => Boolean(id))
                            : protocol.createdInvestigationIds.filter(id => (protocol.findingsByInvestigationId[id] ?? 0) > (initialFindingCountsByInvestigationId.get(id) ?? 0));

                    await Promise.all(
                        revisionInvestigationIds.map(async investigationId => {
                            await options.db.works.updateInvestigation({
                                organizationId: options.organizationId,
                                workId: work.id,
                                id: investigationId,
                                patch: { auditStatus: 'draft' },
                            });
                            await options.db.works.createInvestigationRevision({
                                organizationId: options.organizationId,
                                workId: work.id,
                                investigationId,
                                instruction: userInstruction ?? workspaceSnapshot?.humanEdits.userNote ?? null,
                                runId: run.id,
                                createdBy: 'agent',
                                markConclusionOutdated: !requiresConclusion,
                            });
                        }),
                    );
                }

                await appendEvent({
                    type: 'completed',
                    role: 'system',
                    content: 'Agent run completed',
                    payload: {
                        finishReason: event.finishReason ?? null,
                    },
                });
                await options.db.works.completeRun({
                    organizationId: options.organizationId,
                    workId: work.id,
                    id: run.id,
                });
            },
            onError: error => {
                const message = error instanceof Error ? error.message : String(error ?? 'AI_SERVICE_UNAVAILABLE');
                void appendEvent({
                    type: 'error',
                    role: 'system',
                    content: message,
                    payload: sanitizePayload({ error }),
                }).then(() =>
                    options.db.works.failRun({
                        organizationId: options.organizationId,
                        workId: work.id,
                        id: run.id,
                        error: message,
                    }),
                );

                void recordAiUsage({
                    requestId,
                    context: {
                        organizationId: options.organizationId,
                        userId: options.userId,
                        feature: 'chat_agent',
                        model: execution.modelName,
                        requestId,
                        connectionId: work.connectionId,
                        gateway: execution.gateway,
                        provider: execution.providerKey,
                    },
                    input: {
                        system: agentContext.instructions,
                        messages: uiMessages as any,
                        prompt: null,
                    },
                    latencyMs: Date.now() - startedAt,
                    status: 'error',
                    error,
                });

                return message;
            },
        });
    } catch (error) {
        if (isAiQuotaExceededError(error)) {
            await options.db.works.failRun({
                organizationId: options.organizationId,
                workId: work.id,
                id: run.id,
                error: error.message,
            });
            await appendEvent({
                type: 'error',
                role: 'system',
                content: error.message,
                payload: sanitizePayload({ error }),
            });
            return toAiQuotaExceededResponse(error);
        }

        const message = isLocalMissingAiEnvError(error) ? 'MISSING_AI_ENV' : error instanceof Error ? error.message : 'Internal error';
        await options.db.works.failRun({
            organizationId: options.organizationId,
            workId: work.id,
            id: run.id,
            error: message,
        });
        await appendEvent({
            type: 'error',
            role: 'system',
            content: message,
            payload: sanitizePayload({ error }),
        });

        return new Response(message, {
            status: 500,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }
}
