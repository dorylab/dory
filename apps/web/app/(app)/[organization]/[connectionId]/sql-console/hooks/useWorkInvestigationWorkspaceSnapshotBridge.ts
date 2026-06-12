'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAtomValue } from 'jotai';

import { useDB } from '@/lib/client/use-pglite';
import type { SQLConsoleRuntime } from '../client';
import { selectedResultRowIndexesByKeyAtom, sessionIdByTabAtom } from '../sql-console.store';
import { chartStatesByKeyAtom } from '../components/result-table/components/charts/stores/chart-state.atoms';
import { makeActiveSetAtom } from '../components/result-table/stores/active-set.atoms';

export type WorkInvestigationWorkspaceDirtyState = {
    isDirty: boolean;
    changeSummary: {
        sqlEdited: boolean;
        resultRefreshed: boolean;
        chartConfigChanged: boolean;
        selectedRowsChanged: boolean;
    };
};

export type WorkInvestigationWorkspaceSnapshotInput = {
    investigationId: string;
    workspaceId: string;
    intent: 'continue_analysis';
    humanEdits: {
        sql: string | null;
        resultPreview: Record<string, unknown> | null;
        chartConfig: Record<string, unknown> | null;
        selectedRows: Record<string, unknown> | null;
        userNote: string | null;
        changeSummary: WorkInvestigationWorkspaceDirtyState['changeSummary'];
    };
};

export type WorkInvestigationWorkspaceSnapshotController = {
    collect: (userNote?: string | null) => Promise<WorkInvestigationWorkspaceSnapshotInput>;
    markSent: () => void;
    runActiveSql: () => Promise<void>;
};

type WorkspaceSnapshotSignature = {
    sql: string;
    sessionId: string | null;
    activeSet: number;
    chartConfig: unknown;
    selectedRowIndexes: number[];
};

export const CLEAN_WORK_INVESTIGATION_WORKSPACE_DIRTY_STATE: WorkInvestigationWorkspaceDirtyState = {
    isDirty: false,
    changeSummary: {
        sqlEdited: false,
        resultRefreshed: false,
        chartConfigChanged: false,
        selectedRowsChanged: false,
    },
};

const EMPTY_SELECTED_ROW_INDEXES: number[] = [];

function stableJson(value: unknown) {
    if (value === undefined) return 'undefined';
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function dirtyStateFromSignatures(current: WorkspaceSnapshotSignature, baseline: WorkspaceSnapshotSignature | null): WorkInvestigationWorkspaceDirtyState {
    if (!baseline) return CLEAN_WORK_INVESTIGATION_WORKSPACE_DIRTY_STATE;
    const changeSummary = {
        sqlEdited: current.sql !== baseline.sql,
        resultRefreshed: current.sessionId !== baseline.sessionId || current.activeSet !== baseline.activeSet,
        chartConfigChanged: stableJson(current.chartConfig) !== stableJson(baseline.chartConfig),
        selectedRowsChanged: stableJson(current.selectedRowIndexes) !== stableJson(baseline.selectedRowIndexes),
    };

    return {
        isDirty: Object.values(changeSummary).some(Boolean),
        changeSummary,
    };
}

function dirtyStateKey(state: WorkInvestigationWorkspaceDirtyState) {
    const summary = state.changeSummary;
    return [
        state.isDirty ? '1' : '0',
        summary.sqlEdited ? '1' : '0',
        summary.resultRefreshed ? '1' : '0',
        summary.chartConfigChanged ? '1' : '0',
        summary.selectedRowsChanged ? '1' : '0',
    ].join(':');
}

export function useWorkInvestigationWorkspaceSnapshotBridge({
    runtime,
    workId,
    investigationId,
    linkedTabId,
    onWorkspaceDirtyStateChange,
    onWorkspaceSnapshotControllerChange,
}: {
    runtime: SQLConsoleRuntime;
    workId: string;
    investigationId: string;
    linkedTabId?: string | null;
    onWorkspaceDirtyStateChange?: (state: WorkInvestigationWorkspaceDirtyState) => void;
    onWorkspaceSnapshotControllerChange?: (controller: WorkInvestigationWorkspaceSnapshotController | null) => void;
}) {
    const sessionIdByTab = useAtomValue(sessionIdByTabAtom);
    const chartStatesByKey = useAtomValue(chartStatesByKeyAtom);
    const selectedRowIndexesByKey = useAtomValue(selectedResultRowIndexesByKeyAtom);
    const { dbReady, listResultSetsMeta, getResultRows } = useDB();

    const activeTab = runtime.activeTab;
    const activeTabId = runtime.activeTabId;
    const activeSessionId = activeTabId ? sessionIdByTab[activeTabId] || null : null;
    const readActiveSetAtom = useMemo(() => makeActiveSetAtom(activeTabId, activeSessionId), [activeTabId, activeSessionId]);
    const activeSet = useAtomValue(readActiveSetAtom);
    const activeSetNumber = typeof activeSet === 'number' ? activeSet : -1;
    const chartStateKey = activeTabId && activeSetNumber >= 0 ? `tab:${activeTabId}:set:${activeSetNumber}` : 'unknown';
    const resultStateKey = activeTabId && activeSessionId ? `${activeTabId}:${activeSessionId}#${activeSetNumber}` : 'unknown';
    const activeChartState = chartStateKey === 'unknown' ? null : (chartStatesByKey[chartStateKey] ?? null);
    const activeSelectedRowIndexes = resultStateKey === 'unknown' ? EMPTY_SELECTED_ROW_INDEXES : (selectedRowIndexesByKey[resultStateKey] ?? EMPTY_SELECTED_ROW_INDEXES);

    const baselineSignatureRef = useRef<WorkspaceSnapshotSignature | null>(null);
    const latestSignatureRef = useRef<WorkspaceSnapshotSignature | null>(null);
    const lastCollectedSignatureRef = useRef<WorkspaceSnapshotSignature | null>(null);
    const lastEmittedDirtyStateKeyRef = useRef<string | null>(null);
    const workspaceIdentity = `${workId}:${investigationId}:${linkedTabId ?? ''}`;

    const currentSignature = useMemo<WorkspaceSnapshotSignature | null>(() => {
        if (!activeTabId || activeTab?.tabType !== 'sql') return null;
        return {
            sql: activeTab.content ?? '',
            sessionId: activeSessionId,
            activeSet: activeSetNumber,
            chartConfig: activeChartState,
            selectedRowIndexes: activeSelectedRowIndexes,
        };
    }, [activeChartState, activeSelectedRowIndexes, activeSessionId, activeSetNumber, activeTab, activeTabId]);

    const emitDirtyState = useCallback(
        (state: WorkInvestigationWorkspaceDirtyState) => {
            const nextKey = dirtyStateKey(state);
            if (lastEmittedDirtyStateKeyRef.current === nextKey) return;
            lastEmittedDirtyStateKeyRef.current = nextKey;
            onWorkspaceDirtyStateChange?.(state);
        },
        [onWorkspaceDirtyStateChange],
    );

    useEffect(() => {
        baselineSignatureRef.current = null;
        latestSignatureRef.current = null;
        lastCollectedSignatureRef.current = null;
        lastEmittedDirtyStateKeyRef.current = null;
        emitDirtyState(CLEAN_WORK_INVESTIGATION_WORKSPACE_DIRTY_STATE);
    }, [emitDirtyState, workspaceIdentity]);

    const markSent = useCallback(() => {
        const sentSignature = lastCollectedSignatureRef.current ?? latestSignatureRef.current;
        if (!sentSignature) return;
        baselineSignatureRef.current = sentSignature;
        latestSignatureRef.current = sentSignature;
        lastCollectedSignatureRef.current = null;
        emitDirtyState(CLEAN_WORK_INVESTIGATION_WORKSPACE_DIRTY_STATE);
    }, [emitDirtyState]);

    const runActiveSql = useCallback(async () => {
        if (!activeTab || activeTab.tabType !== 'sql') throw new Error('No SQL workspace tab is active.');

        runtime.editorRef.current?.flushSave?.();
        await runtime.runQuery(activeTab);
    }, [activeTab, runtime]);

    const collect = useCallback(
        async (userNote?: string | null): Promise<WorkInvestigationWorkspaceSnapshotInput> => {
            if (!activeTabId || activeTab?.tabType !== 'sql') throw new Error('No SQL workspace tab is active.');

            runtime.editorRef.current?.flushSave?.();
            const sqlText = runtime.editorRef.current?.getValue?.() ?? activeTab.content ?? '';
            const sessionId =
                activeSessionId ||
                (() => {
                    try {
                        return localStorage.getItem(`sqlconsole:sessionId:${activeTabId}`) || null;
                    } catch {
                        return null;
                    }
                })();
            const selectedRowIndexes = activeSelectedRowIndexes.slice(0, 200);
            let resultPreview: Record<string, unknown> | null = null;
            let selectedRows: Record<string, unknown> | null = selectedRowIndexes.length
                ? {
                      indexes: selectedRowIndexes.slice(0, 20),
                      rows: [],
                  }
                : null;

            if (dbReady && sessionId && activeSetNumber >= 0) {
                const metas = await listResultSetsMeta(sessionId);
                const meta = metas?.find(item => item.setIndex === activeSetNumber) ?? null;
                const rows = await getResultRows(sessionId, activeSetNumber, { rowBudget: 50 });
                resultPreview = {
                    sessionId,
                    setIndex: activeSetNumber,
                    sqlText: meta?.sqlText ?? null,
                    status: meta?.status ?? null,
                    rowCount: meta?.rowCount ?? rows.length,
                    durationMs: meta?.durationMs ?? null,
                    limited: meta?.limited ?? false,
                    limit: meta?.limit ?? null,
                    columns: meta?.columns ?? null,
                    rows: rows.map(row => row.rowData),
                };

                if (selectedRowIndexes.length) {
                    const maxSelectedIndex = Math.max(...selectedRowIndexes);
                    const selectedBudget = Math.min(Math.max(maxSelectedIndex + 1, 50), 5000);
                    const selectedSourceRows = selectedBudget <= rows.length ? rows : await getResultRows(sessionId, activeSetNumber, { rowBudget: selectedBudget });
                    const selectedIndexSet = new Set(selectedRowIndexes.slice(0, 20));
                    selectedRows = {
                        indexes: selectedRowIndexes.slice(0, 20),
                        rows: selectedSourceRows.filter(row => selectedIndexSet.has(row.rid)).map(row => row.rowData),
                    };
                }
            }

            const collectedSignature = {
                sql: sqlText,
                sessionId,
                activeSet: activeSetNumber,
                chartConfig: activeChartState,
                selectedRowIndexes: activeSelectedRowIndexes,
            };
            lastCollectedSignatureRef.current = collectedSignature;

            const dirtyState = dirtyStateFromSignatures(collectedSignature, baselineSignatureRef.current);

            return {
                investigationId,
                workspaceId: activeTabId,
                intent: 'continue_analysis',
                humanEdits: {
                    sql: sqlText,
                    resultPreview,
                    chartConfig: activeChartState && typeof activeChartState === 'object' ? (activeChartState as Record<string, unknown>) : null,
                    selectedRows,
                    userNote: userNote?.trim() || null,
                    changeSummary: dirtyState.changeSummary,
                },
            };
        },
        [
            activeChartState,
            activeSelectedRowIndexes,
            activeSessionId,
            activeSetNumber,
            activeTab,
            activeTabId,
            dbReady,
            getResultRows,
            investigationId,
            listResultSetsMeta,
            runtime.editorRef,
        ],
    );

    useEffect(() => {
        if (!currentSignature || runtime.isLoading) {
            baselineSignatureRef.current = null;
            latestSignatureRef.current = null;
            lastCollectedSignatureRef.current = null;
            emitDirtyState(CLEAN_WORK_INVESTIGATION_WORKSPACE_DIRTY_STATE);
            onWorkspaceSnapshotControllerChange?.(null);
            return;
        }

        latestSignatureRef.current = currentSignature;
        const expectedHydratedSessionId = activeTab?.tabType === 'sql' && activeTab.resultMeta?.source === 'work-run' ? activeTab.resultMeta.sessionId : null;
        const shouldWaitForHydration = Boolean(expectedHydratedSessionId && activeSessionId !== expectedHydratedSessionId);
        if (!baselineSignatureRef.current && !shouldWaitForHydration) {
            baselineSignatureRef.current = currentSignature;
        }

        const dirtyState = dirtyStateFromSignatures(currentSignature, baselineSignatureRef.current);
        emitDirtyState(dirtyState);
    }, [activeSessionId, activeTab, currentSignature, emitDirtyState, onWorkspaceSnapshotControllerChange, runtime.isLoading]);

    useEffect(() => {
        const controller: WorkInvestigationWorkspaceSnapshotController = {
            collect,
            markSent,
            runActiveSql,
        };
        onWorkspaceSnapshotControllerChange?.(controller);
        return () => onWorkspaceSnapshotControllerChange?.(null);
    }, [collect, markSent, onWorkspaceSnapshotControllerChange, runActiveSql]);
}
