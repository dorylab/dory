'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { ArrowLeft, Clipboard, FileText, Loader2, Play, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/registry/new-york-v4/ui/button';
import { useDB } from '@/lib/client/use-pglite';
import { buildInsightDraft, buildInsightRewriteRequest, buildInsights, buildStructuredInsightView, type InsightRewriteResponse } from '@/lib/client/result-set-insights';
import { fetchInsightRewrite, makeInsightRewriteCacheKey } from '@/lib/client/result-insight-rewrite';
import { buildAnalysisSuggestions, buildAnalysisSummaryFromDraft } from '@/lib/analysis/suggestions';
import { buildResultContext } from '@dory/analysis/result-context';
import { runAnalysisRequest } from '@/lib/analysis/client';
import type { AnalysisResultRef, AnalysisSession, AnalysisStep, AnalysisSuggestion, AnalysisWorkspaceState } from '@dory/analysis/types';
import { analysisWorkspaceKeyFor, analysisWorkspaceStateAtom, copilotAnalysisRequestAtom, sessionIdByTabAtom, upsertAnalysisWorkspaceAtom } from '../../sql-console.store';
import { currentSessionMetaAtom } from '../result-table/stores/result-table.atoms';
import { makeActiveSetAtom, upsertActiveSetAtom } from '../result-table/stores/active-set.atoms';

type AnalysisRow = Record<string, unknown>;

function PanelSection(props: { title: string; icon: React.ReactNode; children: React.ReactNode; description?: string }) {
    return (
        <section className="flex flex-col gap-3">
            <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    {props.icon}
                    <span>{props.title}</span>
                </div>
                {props.description ? <div className="text-xs leading-relaxed text-muted-foreground">{props.description}</div> : null}
            </div>
            {props.children}
        </section>
    );
}

function PrimaryConclusion(props: { headline: string; summary?: string }) {
    return (
        <div className="rounded-lg border bg-background px-4 py-3">
            <div className="text-base font-semibold leading-snug text-foreground">{props.headline}</div>
            {props.summary ? <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{props.summary}</div> : null}
        </div>
    );
}

function KeyFindingList(props: { findings: string[]; t: ReturnType<typeof useTranslations> }) {
    if (!props.findings.length) return null;

    return (
        <div className="space-y-2">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{props.t('Insights.Analysis.KeyFindingsTitle')}</div>
            <div className="space-y-2">
                {props.findings.map((item, index) => (
                    <div key={item} className="grid grid-cols-[1.5rem_1fr] gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-background text-xs font-medium text-muted-foreground">{index + 1}</div>
                        <div className="text-sm leading-relaxed text-foreground">{item}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function RecordHighlightList(props: { records: NonNullable<AnalysisSession['outcome']>['recordHighlights']; t: ReturnType<typeof useTranslations> }) {
    if (!props.records.length) return null;

    return (
        <div className="space-y-2">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{props.t('Insights.Analysis.RecordHighlightsTitle')}</div>
            <div className="space-y-2">
                {props.records.slice(0, 5).map(item => (
                    <div key={`${item.label}:${item.value}`} className="rounded-lg border bg-muted/30 px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 text-sm font-medium leading-snug text-foreground">{item.label}</div>
                            <div className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{item.value}</div>
                        </div>
                        {item.note ? <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.note}</div> : null}
                    </div>
                ))}
            </div>
        </div>
    );
}

function LimitationList(props: { limitations?: string[]; t: ReturnType<typeof useTranslations> }) {
    const limitations = props.limitations ?? [];
    if (!limitations.length) return null;

    return (
        <div className="space-y-2">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{props.t('Insights.Analysis.LimitationsTitle')}</div>
            <div className="space-y-2">
                {limitations.map(item => (
                    <div key={item} className="rounded-lg border bg-muted/30 px-3 py-2 text-sm leading-relaxed text-foreground">
                        {item}
                    </div>
                ))}
            </div>
        </div>
    );
}

function findResultRefFromSession(session: AnalysisSession): AnalysisResultRef | null {
    const artifact = session.outcome?.artifacts?.find(item => item.type === 'result_ref');
    return artifact?.type === 'result_ref' ? artifact.resultRef : null;
}

function findSqlFromSession(session: AnalysisSession): string | null {
    const artifact = session.outcome?.artifacts?.find(item => item.type === 'sql');
    return artifact?.type === 'sql' ? artifact.sql : null;
}

function findSourceResultRefFromSession(session: AnalysisSession): AnalysisResultRef {
    return session.contextRef;
}

function formatVisualValue(value: unknown) {
    if (value == null) return '—';
    if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value);
}

function firstNumericColumn(rows: AnalysisRow[]) {
    const row = rows[0] ?? {};
    return Object.keys(row).find(key => typeof row[key] === 'number') ?? null;
}

function firstLabelColumn(rows: AnalysisRow[], numericColumn: string | null) {
    const row = rows[0] ?? {};
    return Object.keys(row).find(key => key !== numericColumn) ?? null;
}

function CompactAnalysisVisual(props: { rows: AnalysisRow[]; kind?: AnalysisSuggestion['kind']; emptyLabel: string; title: string }) {
    const { rows, kind, emptyLabel, title } = props;
    const numericColumn = firstNumericColumn(rows);
    const labelColumn = firstLabelColumn(rows, numericColumn);

    if (!rows.length || !numericColumn) {
        return <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">{emptyLabel}</div>;
    }

    const values = rows.slice(0, kind === 'trend' ? 12 : 6).map(row => ({
        label: labelColumn ? formatVisualValue(row[labelColumn]) : '',
        value: typeof row[numericColumn] === 'number' ? row[numericColumn] : 0,
    }));
    const max = Math.max(...values.map(item => Math.abs(item.value)), 1);

    if (kind === 'distribution') {
        return (
            <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(rows[0] ?? {})
                    .slice(0, 6)
                    .map(([key, value]) => (
                        <div key={key} className="rounded-lg border bg-muted/30 px-3 py-2">
                            <div className="text-[11px] text-muted-foreground">{key}</div>
                            <div className="mt-1 truncate text-sm font-medium text-foreground">{formatVisualValue(value)}</div>
                        </div>
                    ))}
            </div>
        );
    }

    return (
        <div className="rounded-lg border bg-muted/30 px-3 py-3">
            <div className="mb-3 text-xs font-medium text-muted-foreground">{title}</div>
            <div className="space-y-2">
                {values.map((item, index) => (
                    <div key={`${item.label}:${index}`} className="grid grid-cols-[minmax(72px,0.9fr)_minmax(80px,1.4fr)_auto] items-center gap-2">
                        <div className="truncate text-xs text-muted-foreground">{item.label || `#${index + 1}`}</div>
                        <div className="h-2 overflow-hidden rounded-full bg-background">
                            <div className="h-full rounded-full bg-muted-foreground/50" style={{ width: `${Math.max(6, (Math.abs(item.value) / max) * 100)}%` }} />
                        </div>
                        <div className="text-right text-xs font-medium text-foreground">{formatVisualValue(item.value)}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function makeOptimisticSession(params: { suggestion: AnalysisSuggestion; resultRef: AnalysisResultRef; triggerId: string }): AnalysisSession {
    const startedAt = new Date().toISOString();
    const steps = params.suggestion.stepTemplates.map((step, index) => ({
        id: step.id,
        type: index === params.suggestion.stepTemplates.length - 1 ? 'summary' : index === params.suggestion.stepTemplates.length - 2 ? 'execution' : 'reasoning',
        title: step.title,
        status: index === 0 ? 'running' : 'pending',
        startedAt: index === 0 ? startedAt : undefined,
    })) as AnalysisStep[];

    return {
        id: `optimistic:${params.triggerId}`,
        title: params.suggestion.title,
        trigger: {
            type: 'suggestion',
            suggestionId: params.suggestion.id,
        },
        contextRef: params.resultRef,
        status: 'running',
        steps,
        createdAt: startedAt,
        updatedAt: startedAt,
    };
}

function mergeAnalysisSessions(...sessionGroups: Array<AnalysisSession[] | undefined>) {
    const sessions: AnalysisSession[] = [];
    for (const group of sessionGroups) {
        for (const session of group ?? []) {
            const existingIndex = sessions.findIndex(item => item.id === session.id);
            if (existingIndex >= 0) {
                sessions[existingIndex] = session;
            } else {
                sessions.push(session);
            }
        }
    }
    return sessions;
}

function dedupeAnalysisSuggestions(suggestions: AnalysisSuggestion[]) {
    const seen = new Set<string>();
    return suggestions.filter(suggestion => {
        if (seen.has(suggestion.id)) return false;
        seen.add(suggestion.id);
        return true;
    });
}

function suggestionFromPendingRequest(params: {
    requestId: string;
    suggestionId: string;
    action?: AnalysisSuggestion['action'];
    sqlPreview?: string;
    t: ReturnType<typeof useTranslations>;
}): AnalysisSuggestion | null {
    if (!params.action && !params.sqlPreview?.trim()) return null;
    const title = params.action?.title ?? params.t('Insights.Analysis.AiDecision.DefaultLabel');

    return {
        id: params.suggestionId,
        kind: params.action?.type === 'trend' ? 'trend' : params.action?.type === 'distribution' ? 'distribution' : params.action?.type === 'group' ? 'drilldown' : 'topk',
        title,
        description: title,
        label: title,
        goal: title,
        resultTitle: title,
        stepTemplates: [
            { id: `${params.requestId}-inspect-profile`, title: params.t('Insights.Analysis.Steps.InspectProfile') },
            { id: `${params.requestId}-run-next-sql`, title: params.t('Insights.Analysis.Steps.RunNextSql') },
            { id: `${params.requestId}-summarize-next-step`, title: params.t('Insights.Analysis.Steps.SummarizeNextStep') },
        ],
        followupPolicy: 'chain',
        intent: {
            type: 'generate_sql',
            payload: {},
        },
        priority: 100,
        isPrimary: true,
        action: params.action,
        sqlPreview: params.sqlPreview,
    };
}

type AnalysisActionsProps = {
    tabId?: string;
    connectionId?: string | null;
    databaseName?: string | null;
    onDetailStateChange?: (open: boolean) => void;
};

export default function AnalysisActions(props: AnalysisActionsProps) {
    const { tabId, connectionId, databaseName, onDetailStateChange } = props;
    const locale = useLocale();
    const t = useTranslations('SqlConsole');
    const { dbReady, getResultRows, applyServerResult } = useDB();
    const sessionMetas = useAtomValue(currentSessionMetaAtom);
    const sessionIdByTab = useAtomValue(sessionIdByTabAtom);
    const activeSessionId = tabId ? sessionIdByTab[tabId] : undefined;
    const activeSet = useAtomValue(useMemo(() => makeActiveSetAtom(tabId, activeSessionId), [activeSessionId, tabId]));
    const setSessionIdByTab = useSetAtom(sessionIdByTabAtom);
    const setExplicitActiveSet = useSetAtom(upsertActiveSetAtom);
    const analysisRequest = useAtomValue(copilotAnalysisRequestAtom);
    const setAnalysisRequest = useSetAtom(copilotAnalysisRequestAtom);
    const workspaces = useAtomValue(analysisWorkspaceStateAtom);
    const upsertWorkspace = useSetAtom(upsertAnalysisWorkspaceAtom);
    const [sampleRows, setSampleRows] = useState<Array<Record<string, unknown>>>([]);
    const [sampleRowsReady, setSampleRowsReady] = useState(false);
    const [analysisRows, setAnalysisRows] = useState<AnalysisRow[]>([]);
    const [runningSuggestionId, setRunningSuggestionId] = useState<string | null>(null);
    const [rewritten, setRewritten] = useState<InsightRewriteResponse | null>(null);
    const handledRequestIdsRef = useRef<Set<string>>(new Set());

    const workspaceKey = analysisWorkspaceKeyFor(tabId, activeSessionId, activeSet);
    const workspace = (workspaceKey ? workspaces[workspaceKey] : null) ?? null;

    useEffect(() => {
        let canceled = false;
        setSampleRowsReady(false);
        (async () => {
            if (!dbReady || !activeSessionId || activeSet == null || activeSet < 0) {
                if (!canceled) {
                    setSampleRows([]);
                    setSampleRowsReady(true);
                }
                return;
            }

            const rows = await getResultRows(activeSessionId, activeSet, {
                rowBudget: 200,
                yieldUi: false,
            }).catch(() => []);
            if (canceled) return;
            setSampleRows(rows.map(row => row.rowData as Record<string, unknown>).slice(0, 200));
            setSampleRowsReady(true);
        })();

        return () => {
            canceled = true;
        };
    }, [activeSessionId, activeSet, dbReady, getResultRows]);

    const insightRewriteRequest = useMemo(() => {
        if (!sampleRowsReady) return null;
        const columns = Array.isArray(sessionMetas?.columns) ? sessionMetas.columns : [];
        return buildInsightRewriteRequest({
            stats: sessionMetas?.stats,
            columns,
            sqlText: sessionMetas?.sqlText ?? '',
            rows: sampleRows,
            locale,
            t: (key, values) => t(key as any, values),
        });
    }, [locale, sampleRows, sampleRowsReady, sessionMetas, t]);
    const insightRewriteCacheKey = useMemo(() => makeInsightRewriteCacheKey(insightRewriteRequest), [insightRewriteRequest]);

    useEffect(() => {
        if (!insightRewriteCacheKey) {
            setRewritten(null);
            return;
        }

        let canceled = false;

        void (async () => {
            const payload = await fetchInsightRewrite(insightRewriteCacheKey);
            if (!canceled) setRewritten(payload);
        })();

        return () => {
            canceled = true;
        };
    }, [insightRewriteCacheKey]);

    const insightBundle = useMemo(() => {
        if (!activeSessionId || activeSet == null || activeSet < 0) return null;
        const columns = Array.isArray(sessionMetas?.columns) ? sessionMetas.columns : [];
        const draft = buildInsightDraft({
            stats: sessionMetas?.stats,
            columns,
            sqlText: sessionMetas?.sqlText ?? '',
            rows: sampleRows,
            locale,
            t: (key, values) => t(key as any, values),
        });
        const view = buildInsights(
            {
                stats: sessionMetas?.stats,
                columns,
                sqlText: sessionMetas?.sqlText ?? '',
                rows: sampleRows,
                locale,
                t: (key, values) => t(key as any, values),
            },
            rewritten,
        );
        const structured = buildStructuredInsightView({
            context: {
                stats: sessionMetas?.stats,
                columns,
                sqlText: sessionMetas?.sqlText ?? '',
                rows: sampleRows,
                locale,
                t: (key, values) => t(key as any, values),
            },
            draft,
            view,
        });
        const resultContext = buildResultContext({
            sessionId: activeSessionId,
            setIndex: activeSet,
            sqlText: sessionMetas?.sqlText ?? '',
            databaseName: databaseName ?? null,
            rowCount: sessionMetas?.rowCount ?? sampleRows.length,
            columns,
            stats: sessionMetas?.stats,
        });
        const suggestions = buildAnalysisSuggestions({
            resultContext,
            draft,
            recommendedActions: structured.decision.items.flatMap(item => item.actions),
            recommendedActionsOnly: !!rewritten?.items?.some(item => item.actions.length > 0),
            t: (key, values) => t(key as any, values),
        });
        return {
            draft,
            view,
            structured: {
                ...structured,
                narrative: buildAnalysisSummaryFromDraft(draft, view.insights),
            },
            resultContext,
            suggestions,
        };
    }, [activeSessionId, activeSet, databaseName, locale, rewritten, sampleRows, sessionMetas, t]);

    useEffect(() => {
        if (!workspaceKey || !insightBundle || !tabId || !activeSessionId || activeSet == null || activeSet < 0) return;

        upsertWorkspace({
            tabId,
            sessionId: activeSessionId,
            setIndex: activeSet,
            patch: prev => {
                const base: AnalysisWorkspaceState = prev ?? {
                    suggestions: [],
                    sessions: [],
                };

                const suggestions = dedupeAnalysisSuggestions(insightBundle.suggestions);
                const selectedSuggestionId =
                    analysisRequest?.sourceResultRef?.sessionId === activeSessionId && analysisRequest?.sourceResultRef?.setIndex === activeSet
                        ? analysisRequest.suggestionId
                        : (base.currentFocus?.suggestionId ?? suggestions[0]?.id);
                const selectedSuggestion = suggestions.find(item => item.id === selectedSuggestionId) ?? suggestions[0];

                return {
                    ...base,
                    suggestions,
                    currentFocus: selectedSuggestion
                        ? {
                              suggestionId: selectedSuggestion.id,
                              title: selectedSuggestion.title,
                          }
                        : base.currentFocus,
                };
            },
        });
    }, [activeSessionId, activeSet, analysisRequest, insightBundle, tabId, upsertWorkspace, workspaceKey]);

    const workspaceSuggestions = useMemo(() => dedupeAnalysisSuggestions(workspace?.suggestions ?? []), [workspace?.suggestions]);

    const selectedSuggestion = useMemo(() => {
        if (!workspace?.currentFocus?.suggestionId) return workspaceSuggestions[0] ?? null;
        return workspaceSuggestions.find(item => item.id === workspace.currentFocus?.suggestionId) ?? workspaceSuggestions[0] ?? null;
    }, [workspace, workspaceSuggestions]);

    const selectedSession = useMemo(() => {
        if (!workspace?.sessions?.length || !workspace.lastSelectedSessionId) return null;
        const session = workspace.sessions.find(item => item.id === workspace.lastSelectedSessionId) ?? null;
        if (!session) return null;
        if (session.contextRef.sessionId !== activeSessionId || session.contextRef.setIndex !== activeSet) return null;
        return session;
    }, [activeSessionId, activeSet, workspace]);

    useEffect(() => {
        onDetailStateChange?.(!!selectedSession);

        return () => {
            onDetailStateChange?.(false);
        };
    }, [onDetailStateChange, selectedSession]);

    const selectedSessionSuggestion = useMemo(() => {
        if (!selectedSession) return selectedSuggestion;
        const suggestionId = selectedSession.trigger.suggestionId;
        return workspaceSuggestions.find(item => item.id === suggestionId) ?? selectedSuggestion;
    }, [selectedSession, selectedSuggestion, workspaceSuggestions]);

    const selectedSessionSql = useMemo(() => (selectedSession ? findSqlFromSession(selectedSession) : null), [selectedSession]);
    const selectedSessionResultRef = useMemo(() => (selectedSession ? findResultRefFromSession(selectedSession) : null), [selectedSession]);
    const selectedSourceResultRef = useMemo(() => (selectedSession ? findSourceResultRefFromSession(selectedSession) : null), [selectedSession]);

    useEffect(() => {
        let canceled = false;

        (async () => {
            if (!dbReady || !selectedSessionResultRef) {
                if (!canceled) setAnalysisRows([]);
                return;
            }

            const rows = await getResultRows(selectedSessionResultRef.sessionId, selectedSessionResultRef.setIndex, {
                rowBudget: 80,
                yieldUi: false,
            }).catch(() => []);
            if (canceled) return;
            setAnalysisRows(rows.map(row => row.rowData as AnalysisRow));
        })();

        return () => {
            canceled = true;
        };
    }, [dbReady, getResultRows, selectedSessionResultRef]);

    const handleSelectSuggestion = (suggestion: AnalysisSuggestion) => {
        if (!tabId || !activeSessionId || activeSet == null || activeSet < 0) return;
        upsertWorkspace({
            tabId,
            sessionId: activeSessionId,
            setIndex: activeSet,
            patch: prev => ({
                ...(prev ?? { suggestions: [], sessions: [] }),
                suggestions: dedupeAnalysisSuggestions(prev?.suggestions ?? insightBundle?.suggestions ?? []),
                sessions: prev?.sessions ?? [],
                lastSelectedSessionId: prev?.lastSelectedSessionId,
                currentFocus: {
                    suggestionId: suggestion.id,
                    title: suggestion.title,
                },
            }),
        });
    };

    const handleBackToActions = () => {
        if (!tabId || !activeSessionId || activeSet == null || activeSet < 0) return;
        if (selectedSourceResultRef) {
            setSessionIdByTab(prev => ({
                ...prev,
                [tabId]: selectedSourceResultRef.sessionId,
            }));
            try {
                localStorage.setItem(`sqlconsole:sessionId:${tabId}`, selectedSourceResultRef.sessionId);
            } catch {
                // ignore local storage failures
            }
            setExplicitActiveSet({
                tabId,
                sessionId: selectedSourceResultRef.sessionId,
                activeSet: selectedSourceResultRef.setIndex,
            });
        }
        upsertWorkspace({
            tabId,
            sessionId: selectedSourceResultRef?.sessionId ?? activeSessionId,
            setIndex: selectedSourceResultRef?.setIndex ?? activeSet,
            patch: prev => ({
                ...(prev ?? { suggestions: [], sessions: [] }),
                suggestions: dedupeAnalysisSuggestions(prev?.suggestions ?? insightBundle?.suggestions ?? []),
                sessions: prev?.sessions ?? [],
                currentFocus: prev?.currentFocus,
                lastSelectedSessionId: undefined,
            }),
        });
    };

    const handleOpenGeneratedResult = (ref: AnalysisResultRef | null) => {
        if (!ref || !tabId) return;
        setSessionIdByTab(prev => ({
            ...prev,
            [tabId]: ref.sessionId,
        }));
        try {
            localStorage.setItem(`sqlconsole:sessionId:${tabId}`, ref.sessionId);
        } catch {
            // ignore local storage failures
        }
        setExplicitActiveSet({
            tabId,
            sessionId: ref.sessionId,
            activeSet: ref.setIndex,
        });
    };

    const handleCopyAnalysisSql = async (sql: string | null) => {
        if (!sql?.trim()) return;
        await navigator.clipboard.writeText(sql);
        toast.success(t('Insights.Analysis.SqlCopied'));
    };

    const persistAnalysisSession = (sourceSessionId: string, sourceSetIndex: number, session: AnalysisSession, optimisticId?: string) => {
        if (!tabId) return;

        upsertWorkspace({
            tabId,
            sessionId: sourceSessionId,
            setIndex: sourceSetIndex,
            patch: prev => {
                const existingSessions = (prev?.sessions ?? []).filter(item => item.id !== optimisticId);
                const sessions = mergeAnalysisSessions(existingSessions, [session]);

                return {
                    currentFocus: prev?.currentFocus,
                    suggestions: dedupeAnalysisSuggestions(prev?.suggestions ?? insightBundle?.suggestions ?? []),
                    sessions,
                    lastSelectedSessionId: session.id,
                };
            },
        });

        const targetResultRef = findResultRefFromSession(session);
        if (!targetResultRef) return;

        upsertWorkspace({
            tabId,
            sessionId: targetResultRef.sessionId,
            setIndex: targetResultRef.setIndex,
            patch: prev => ({
                currentFocus: session.outcome?.followups[0]
                    ? {
                          suggestionId: session.outcome.followups[0].id,
                          title: session.outcome.followups[0].title,
                      }
                    : prev?.currentFocus,
                suggestions: dedupeAnalysisSuggestions(session.outcome?.followups ?? prev?.suggestions ?? []),
                sessions: mergeAnalysisSessions(prev?.sessions),
                lastSelectedSessionId: undefined,
            }),
        });
    };

    const insertOptimisticSession = (suggestion: AnalysisSuggestion, requestId: string) => {
        if (!tabId || !activeSessionId || activeSet == null || activeSet < 0) return null;
        const optimistic = makeOptimisticSession({
            suggestion,
            triggerId: requestId,
            resultRef: {
                sessionId: activeSessionId,
                setIndex: activeSet,
            },
        });
        upsertWorkspace({
            tabId,
            sessionId: activeSessionId,
            setIndex: activeSet,
            patch: prev => ({
                ...(prev ?? { suggestions: [], sessions: [] }),
                suggestions: dedupeAnalysisSuggestions(prev?.suggestions ?? insightBundle?.suggestions ?? []),
                sessions: [...(prev?.sessions ?? []).filter(item => item.id !== optimistic.id), optimistic],
                lastSelectedSessionId: optimistic.id,
                currentFocus: {
                    suggestionId: suggestion.id,
                    title: suggestion.title,
                },
            }),
        });
        return optimistic.id;
    };

    const handleRunSuggestion = useCallback(
        async (suggestion: AnalysisSuggestion, requestId = `${suggestion.id}-${Date.now()}`) => {
            if (!tabId || !activeSessionId || activeSet == null || activeSet < 0 || !connectionId || !insightBundle) {
                return;
            }

            handleSelectSuggestion(suggestion);
            setRunningSuggestionId(suggestion.id);
            const optimisticId = insertOptimisticSession(suggestion, requestId);

            try {
                const response = await runAnalysisRequest({
                    tabId,
                    context: {
                        connectionId,
                        databaseName: databaseName ?? null,
                        resultRef: {
                            sessionId: activeSessionId,
                            setIndex: activeSet,
                        },
                        resultContext: insightBundle.resultContext,
                        insight: insightBundle.structured,
                    },
                    trigger: {
                        type: 'suggestion',
                        suggestionId: suggestion.id,
                        sqlPreview: suggestion.sqlPreview ?? null,
                        action: suggestion.action ?? null,
                    },
                });

                const sourceRef = {
                    sessionId: activeSessionId,
                    setIndex: activeSet,
                };

                await applyServerResult(response.query);
                persistAnalysisSession(sourceRef.sessionId, sourceRef.setIndex, response.session, optimisticId ?? undefined);
            } catch (error) {
                toast.error(error instanceof Error ? error.message : t('Insights.Analysis.Errors.RunFailed'));
            } finally {
                setRunningSuggestionId(null);
            }
        },
        [
            activeSessionId,
            activeSet,
            applyServerResult,
            connectionId,
            databaseName,
            handleSelectSuggestion,
            insightBundle,
            insertOptimisticSession,
            persistAnalysisSession,
            t,
            tabId,
        ],
    );

    useEffect(() => {
        if (!analysisRequest?.id || !activeSessionId || activeSet == null || activeSet < 0 || !insightBundle) return;
        if (handledRequestIdsRef.current.has(analysisRequest.id)) return;
        if (analysisRequest.sourceResultRef && (analysisRequest.sourceResultRef.sessionId !== activeSessionId || analysisRequest.sourceResultRef.setIndex !== activeSet)) {
            return;
        }

        const suggestion =
            workspaceSuggestions.find(item => item.id === analysisRequest.suggestionId) ??
            insightBundle.suggestions.find(item => item.id === analysisRequest.suggestionId) ??
            suggestionFromPendingRequest({
                requestId: analysisRequest.id,
                suggestionId: analysisRequest.suggestionId,
                action: analysisRequest.action,
                sqlPreview: analysisRequest.sqlPreview,
                t,
            });
        if (!suggestion) {
            setAnalysisRequest(null);
            return;
        }

        handledRequestIdsRef.current.add(analysisRequest.id);
        void handleRunSuggestion(
            analysisRequest.action
                ? {
                      ...suggestion,
                      action: analysisRequest.action,
                      sqlPreview: analysisRequest.sqlPreview ?? suggestion.sqlPreview,
                  }
                : {
                      ...suggestion,
                      sqlPreview: analysisRequest.sqlPreview ?? suggestion.sqlPreview,
                  },
            analysisRequest.id,
        ).finally(() => {
            setAnalysisRequest(null);
        });
    }, [activeSessionId, activeSet, analysisRequest, handleRunSuggestion, insightBundle, setAnalysisRequest, workspaceSuggestions]);

    if (!activeSessionId || activeSet == null || activeSet < 0 || !insightBundle) {
        return null;
    }

    if (selectedSession) {
        if (selectedSession.status === 'running') {
            return (
                <div className="flex min-h-full flex-col">
                    <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                        <div className="flex min-w-0 items-center gap-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleBackToActions}>
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-foreground">{selectedSession.title}</div>
                                <div className="mt-0.5 truncate text-xs text-muted-foreground">{t('Insights.Analysis.RunningDescription')}</div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-1 items-center justify-center px-6 py-16">
                        <div className="flex flex-col items-center gap-3 text-center">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            <div className="text-sm font-medium text-foreground">{t('Insights.Analysis.LoadingTitle')}</div>
                            <div className="max-w-72 text-xs leading-relaxed text-muted-foreground">{t('Insights.Analysis.LoadingDescription')}</div>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="flex min-h-full flex-col">
                <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleBackToActions}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground">{selectedSession.title}</div>
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">{t('Insights.Analysis.ActionPageSubtitle')}</div>
                        </div>
                    </div>
                </div>

                <div className="flex-1">
                    <div className="flex flex-col gap-4 p-4">
                        <PanelSection
                            title={t('Insights.Analysis.ConclusionTitle')}
                            icon={<Sparkles className="h-3.5 w-3.5 text-muted-foreground" />}
                            description={t('Insights.Analysis.ConclusionDescription')}
                        >
                            <PrimaryConclusion
                                headline={selectedSession.outcome?.headline ?? selectedSession.title}
                                summary={selectedSession.outcome?.summary ?? insightBundle.structured.narrative}
                            />
                        </PanelSection>

                        <PanelSection
                            title={t('Insights.Analysis.ResultTitle')}
                            icon={<FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                            description={t('Insights.Analysis.ResultDescription')}
                        >
                            <div className="rounded-lg border bg-background px-4 py-3">
                                {selectedSession.outcome ? (
                                    <div className="space-y-4">
                                        <LimitationList limitations={selectedSession.outcome.limitations} t={t} />

                                        <KeyFindingList findings={selectedSession.outcome.keyFindings} t={t} />

                                        <RecordHighlightList records={selectedSession.outcome.recordHighlights} t={t} />

                                        {selectedSession.outcome.sections.length ? (
                                            <div className="space-y-2">
                                                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                                                    {t('Insights.Analysis.SupportingDetailsTitle')}
                                                </div>
                                                <div className="space-y-2">
                                                    {selectedSession.outcome.sections.map(section => (
                                                        <div key={section.id} className="rounded-lg border bg-muted/30 px-3 py-2">
                                                            <div className="text-sm font-medium text-foreground">{section.title}</div>
                                                            <div className="mt-1 space-y-1">
                                                                {section.items.slice(0, 4).map(item => (
                                                                    <div key={item} className="text-xs leading-relaxed text-muted-foreground">
                                                                        {item}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null}

                                        <CompactAnalysisVisual
                                            rows={analysisRows}
                                            kind={selectedSessionSuggestion?.kind}
                                            title={t('Insights.Analysis.VisualResultTitle')}
                                            emptyLabel={t('Insights.Analysis.VisualResultEmpty')}
                                        />
                                    </div>
                                ) : (
                                    <div className="text-xs text-muted-foreground">{t('Insights.Analysis.ResultPending')}</div>
                                )}
                            </div>
                        </PanelSection>

                        <PanelSection
                            title={t('Insights.Analysis.GeneratedSqlTitle')}
                            icon={<FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                            description={t('Insights.Analysis.GeneratedSqlDescription')}
                        >
                            <div className="rounded-lg border bg-background px-4 py-3">
                                {selectedSessionSql ? (
                                    <div className="space-y-3">
                                        <pre className="max-h-64 overflow-auto rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-foreground">{selectedSessionSql}</pre>
                                        <div className="flex flex-wrap gap-2">
                                            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => void handleCopyAnalysisSql(selectedSessionSql)}>
                                                <Clipboard className="mr-2 h-3.5 w-3.5" />
                                                {t('Insights.Analysis.CopySql')}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 text-xs"
                                                onClick={() => handleOpenGeneratedResult(selectedSessionResultRef)}
                                                disabled={!selectedSessionResultRef}
                                            >
                                                <Play className="mr-2 h-3.5 w-3.5" />
                                                {t('Insights.Analysis.ApplyResult')}
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-xs text-muted-foreground">{t('Insights.Analysis.NoGeneratedSql')}</div>
                                )}
                            </div>
                        </PanelSection>
                    </div>
                </div>
            </div>
        );
    }

    if (runningSuggestionId) {
        return (
            <div className="flex h-full items-center justify-center px-6 text-center">
                <div className="max-w-72 text-sm leading-relaxed text-muted-foreground">{t('Insights.Analysis.RunningDescription')}</div>
            </div>
        );
    }

    return null;
}
