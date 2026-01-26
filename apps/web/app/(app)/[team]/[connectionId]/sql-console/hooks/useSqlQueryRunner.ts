'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useAtom } from 'jotai';
import { useDB } from '@/lib/client/use-pglite';
import { useQuery } from '@/hooks/use-query';
import { authFetch } from '@/lib/client/auth-fetch';
import { SQLTab } from '@/types/tabs';
import { runningTabsAtom, sessionIdByTabAtom } from '../sql-console.store';
import { SQLEditorHandle } from '../components/sql-editor';
import { useTranslations } from 'next-intl';
import { enforceSelectLimit } from '@/lib/utils/enforce-select-limit';
import { splitMultiSQL } from '@/lib/utils/split-multi-sql';

type RequestAITabTitle = (tab: SQLTab, options?: { force?: boolean; sqlTextOverride?: string }) => Promise<void> | void;
type BuildTableQuery = (tab: SQLTab) => string;

function genSessionId() {
    // @ts-ignore
    return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const LEADING_COMMENTS_REGEX = /^\s*(?:(?:--[^\n]*\n)|(?:#[^\n]*\n)|(?:\/\*[\s\S]*?\*\/\s*))*/;

function applyLimitToStatement(statement: string, limit: number) {
    const match = statement.match(LEADING_COMMENTS_REGEX);
    const prefix = match?.[0] ?? '';
    const body = statement.slice(prefix.length);
    const trimmedBody = body.trim();
    if (!trimmedBody) return statement;
    const limited = enforceSelectLimit(trimmedBody, limit);
    if (limited === trimmedBody) return statement;
    return `${prefix}${limited}`;
}

function applyLimitToSql(sqlText: string, limit?: number) {
    if (!limit || !Number.isFinite(limit) || limit <= 0) return sqlText;
    const statements = splitMultiSQL(sqlText);
    if (statements.length <= 1) {
        return applyLimitToStatement(sqlText, limit);
    }
    return statements.map(statement => applyLimitToStatement(statement, limit)).join(';\n');
}

export function useSqlQueryRunner({
    activeDatabase,
    activeTab,
    tabs,
    userId,
    requestAITabTitle,
    buildTableQuery,
}: {
    activeDatabase: string | null | undefined;
    activeTab: SQLTab | undefined;
    tabs: SQLTab[];
    userId: string | undefined;
    requestAITabTitle: RequestAITabTitle;
    buildTableQuery: BuildTableQuery;
}) {
    const { run: query } = useQuery();
    const { dbReady, setUserId, createQuerySession, finishQuerySession, applyServerResult } = useDB();
    const userReady = !!userId;
    const t = useTranslations('SqlConsole');

    const editorRef = useRef<SQLEditorHandle | null>(null);
    const abortControllersRef = useRef<Record<string, AbortController | undefined>>({});
    const [sessionIdMap, setSessionIdMap] = useAtom(sessionIdByTabAtom);
    const [runningTabs, setRunningTabs] = useAtom(runningTabsAtom);

    useEffect(() => {
        if (userReady) {
            setUserId(userId!);
        }
    }, [setUserId, userId, userReady]);

    const runQuery = useCallback(
        async (tab: SQLTab, options?: { sqlOverride?: string; databaseOverride?: string | null; limit?: number }) => {
            if (!dbReady || !tab || !userReady) return;

            const tabId = tab.tabId;
            const sql = editorRef.current?.getValue() ?? (activeTab?.tabType === 'sql' ? activeTab?.content ?? '' : '');
            const sqlText = (options?.sqlOverride ?? (tab.tabType === 'table' ? buildTableQuery(tab) : sql ?? '')).trim();
            const finalSqlText = tab.tabType === 'sql' ? applyLimitToSql(sqlText, options?.limit) : sqlText;
            if (!finalSqlText) return;
            let database: string | null = null;

            if (options?.databaseOverride) {
                database = options.databaseOverride;
            } else if (tab.tabType === 'table' && tab.databaseName) {
                database = tab.databaseName;
            } else if (activeDatabase) {
                database = activeDatabase;
            }

            const stopOnError = false;
            const source = tab.tabType === 'table' ? 'table-preview' : 'sql-console';

            setRunningTabs(p => ({ ...p, [tabId]: 'running' }));
            const controller = new AbortController();
            abortControllersRef.current[tabId] = controller;

            const sessionId = genSessionId();
            setSessionIdMap(p => ({ ...p, [tabId]: sessionId }));
            try {
                localStorage.setItem(`sqlconsole:sessionId:${tabId}`, sessionId);
            } catch {
                // ignore
            }

            const t0 = performance.now();

            try {
                await createQuerySession({
                    tabId,
                    sqlText: finalSqlText,
                    database,
                    stopOnError,
                    source,
                    sessionId,
                });

                const res = await query(
                    {
                        sql: finalSqlText,
                        database,
                        stopOnError,
                        sessionId,
                        userId,
                        tabId,
                        source,
                    },
                    { signal: controller.signal },
                );

                const payload = (res as any)?.data;
                if (!payload || !payload.session) {
                    throw new Error(t('Errors.InvalidSessionData'));
                }
                await applyServerResult(payload);

                const totalMs = Math.round(performance.now() - t0);
                await finishQuerySession(sessionId, {
                    status: payload.session.status ?? 'success',
                    resultSetCount: payload.meta?.totalSets ?? payload.session?.resultSetCount ?? 0,
                    durationMs: payload.session.durationMs ?? totalMs,
                });

                setRunningTabs(p => ({
                    ...p,
                    [tabId]: payload.session.status ?? 'success',
                }));

                const latestTab = tabs.find(t => t.tabId === tabId);
                if (latestTab) {
                    void requestAITabTitle(latestTab, { sqlTextOverride: finalSqlText });
                }
            } catch (e: any) {
                console.error('[SQLConsoleClient.runQuery] error:', e);
                if (e?.name === 'AbortError') {
                    try {
                        const totalMs = Math.round(performance.now() - t0);
                        await finishQuerySession(sessionId, {
                            status: 'canceled',
                            errorMessage: t('Errors.QueryCanceled'),
                            durationMs: totalMs,
                        });
                    } catch {
                        // ignore
                    }
                    setRunningTabs(p => ({ ...p, [tabId]: 'canceled' }));
                } else {
                    try {
                        await finishQuerySession(sessionId, {
                            status: 'error',
                            errorMessage: String(e?.message ?? e),
                        });
                    } catch {
                        // ignore
                    }
                    setRunningTabs(p => ({ ...p, [tabId]: 'error' }));
                }
            } finally {
                const stored = abortControllersRef.current[tabId];
                if (stored && stored === controller) {
                    delete abortControllersRef.current[tabId];
                }
            }
        },
        [dbReady, userReady, activeTab, activeDatabase, query, createQuerySession, applyServerResult, finishQuerySession, setRunningTabs, setSessionIdMap, userId, tabs, requestAITabTitle, buildTableQuery, t],
    );

    const cancelQuery = useCallback(
        (tab: SQLTab) => {
            if (!tab) return;
            const tabId = tab.tabId;

            const controller = abortControllersRef.current[tabId];
            if (controller) {
                controller.abort();
            }

            let sessionId = sessionIdMap[tabId];
            if (!sessionId) {
                try {
                    sessionId = localStorage.getItem(`sqlconsole:sessionId:${tabId}`) as string ?? undefined;
                } catch {
                    // ignore
                }
            }

            if (!sessionId) {
                return;
            }

            authFetch('/api/query/cancel', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ sessionId }),
            }).catch(error => {
                console.error('[SQLConsoleClient.cancelQuery] cancel API failed', error);
            });
        },
        [sessionIdMap],
    );

    return {
        editorRef,
        runQuery,
        cancelQuery,
        runningTabs,
        dbReady,
        userReady,
    };
}
