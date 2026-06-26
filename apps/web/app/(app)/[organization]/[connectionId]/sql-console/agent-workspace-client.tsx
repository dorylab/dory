'use client';

import React, { Activity, useCallback, useEffect, useMemo, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Group, Panel, Separator as PanelSeparator, type Layout } from 'react-resizable-panels';
import { Bot, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { cn } from '@dory/web-utils';
import type { SQLTab } from '@dory/shared/types/tabs';
import { executeActionClient } from '@/lib/actions/client';
import { authFetch } from '@/lib/client/auth-fetch';
import { buildAgentRunDetailPath } from '@/lib/agent-runs/workspace-url';
import { Button } from '@/registry/new-york-v4/ui/button';
import { useTranslations } from 'next-intl';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/registry/new-york-v4/ui/alert-dialog';
import { copilotPanelOpenAtom, copilotPanelWidthAtom, editorSelectionByTabAtom, inlineSqlAskByTabAtom } from './sql-console.store';

import { SQLConsoleSidebar } from '../../components/sql-console-sidebar/sql-console-sidebar';
import type { RenameTablePayload, TableActionPayload } from '../../components/sql-console-sidebar/types';
import { SavedQueriesSidebar, type SavedQueryItem } from './components/saved-queries/saved-queries-sidebar';
import SQLTabEmpty from './components/tabs/tab-empty';
import { SQLTabs } from './components/tabs';
import { SqlMode } from './components/copilot-modes/sql-mode';
import { TableMode } from './components/copilot-modes/table-mode';
import { useSqlConsoleClient } from './hooks/useSqlConsoleClient';
import type { SQLEditorHandle } from './components/sql-editor';
import { applyRenamedTableName, buildQueryTableSql } from './table-action-sql';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { sqlWorkspaceScopeAtom, type SqlWorkspaceScope } from './workspace-scope';
import { AgentRunWorkspacePanel } from './agent-run-workspace-panel';

const INITIAL_LAYOUT = {
    horizontal: {
        total: 100,
        default: [20, 80] as [number, number],
        leftPanel: {
            min: 15,
            max: 40,
        },
        middlePanel: {
            min: 40,
        },
    },
    copilot: {
        defaultWidth: 30,
        minWidth: 10,
        maxWidth: 50,
    },
    tabs: {
        defaultHeaderHeight: 36,
    },
    editorFocusRetry: {
        maxAttempts: 5,
        delayMs: 50,
    },
} as const;

const WORKSPACE_RAIL_WIDTH = 40;
const AGENT_RUN_PANEL_WIDTH = 300;

type SerializedWorkspaceTab = {
    tabId: string;
    tabType: string;
    tabName: string;
    orderIndex: number;
    content?: string;
    databaseName?: string;
    tableName?: string;
    activeSubTab?: string | null;
    dataView?: unknown;
};

type WorkspaceChangeSummary = {
    changed: boolean;
    changeSummary: string[];
    addedTabCount: number;
    removedTabCount: number;
    renamedTabCount: number;
    editedSqlTabCount: number;
    updatedTableTabCount: number;
    reordered: boolean;
};

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function normalizeHorizontalLayout(layout: readonly number[] | undefined): [number, number] {
    if (!Array.isArray(layout) || layout.length === 0) return INITIAL_LAYOUT.horizontal.default;

    const left = layout[0] ?? INITIAL_LAYOUT.horizontal.default[0];
    const middle = layout[1] ?? INITIAL_LAYOUT.horizontal.total - left;
    const total = left + middle;

    if (total <= 0) return INITIAL_LAYOUT.horizontal.default;

    const normalizedLeft = (left / total) * INITIAL_LAYOUT.horizontal.total;
    return [normalizedLeft, INITIAL_LAYOUT.horizontal.total - normalizedLeft];
}

function serializeWorkspaceTabs(tabs: readonly SQLTab[], activeTabId: string | null | undefined, activeSqlContent?: string | null, sqlContentsByTabId?: Record<string, string>) {
    return JSON.stringify(
        tabs.map((tab, index) => {
            const base = {
                tabId: tab.tabId,
                tabType: tab.tabType,
                tabName: tab.tabName ?? '',
                orderIndex: index,
                connectionId: tab.connectionId ?? '',
                workId: tab.workId ?? null,
            };

            if (tab.tabType === 'table') {
                return {
                    ...base,
                    databaseName: tab.databaseName ?? '',
                    tableName: tab.tableName ?? '',
                    activeSubTab: tab.activeSubTab ?? null,
                    dataView: tab.dataView ?? null,
                };
            }

            return {
                ...base,
                content:
                    sqlContentsByTabId?.[tab.tabId] ??
                    (tab.tabId === activeTabId && activeSqlContent !== null && typeof activeSqlContent !== 'undefined' ? activeSqlContent : (tab.content ?? '')),
                status: tab.status ?? 'idle',
                resultMeta: tab.resultMeta ?? null,
            };
        }),
    );
}

function parseWorkspaceTabs(value: string | null): SerializedWorkspaceTab[] {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item): item is SerializedWorkspaceTab => item && typeof item === 'object' && typeof item.tabId === 'string' && typeof item.tabName === 'string');
    } catch {
        return [];
    }
}

function tabNames(tabs: SerializedWorkspaceTab[]) {
    return tabs
        .map(tab => tab.tabName || 'Untitled tab')
        .slice(0, 3)
        .join(', ');
}

function summarizeWorkspaceChanges(beforeFingerprint: string | null, afterFingerprint: string): WorkspaceChangeSummary {
    const beforeTabs = parseWorkspaceTabs(beforeFingerprint);
    const afterTabs = parseWorkspaceTabs(afterFingerprint);
    const beforeById = new Map(beforeTabs.map(tab => [tab.tabId, tab]));
    const afterById = new Map(afterTabs.map(tab => [tab.tabId, tab]));
    const addedTabs = afterTabs.filter(tab => !beforeById.has(tab.tabId));
    const removedTabs = beforeTabs.filter(tab => !afterById.has(tab.tabId));
    let renamedTabCount = 0;
    let editedSqlTabCount = 0;
    let updatedTableTabCount = 0;

    for (const afterTab of afterTabs) {
        const beforeTab = beforeById.get(afterTab.tabId);
        if (!beforeTab) continue;

        if ((beforeTab.tabName ?? '') !== (afterTab.tabName ?? '')) {
            renamedTabCount += 1;
        }

        if (afterTab.tabType === 'sql' && (beforeTab.content ?? '') !== (afterTab.content ?? '')) {
            editedSqlTabCount += 1;
        }

        if (
            afterTab.tabType === 'table' &&
            ((beforeTab.databaseName ?? '') !== (afterTab.databaseName ?? '') ||
                (beforeTab.tableName ?? '') !== (afterTab.tableName ?? '') ||
                (beforeTab.activeSubTab ?? null) !== (afterTab.activeSubTab ?? null) ||
                JSON.stringify(beforeTab.dataView ?? null) !== JSON.stringify(afterTab.dataView ?? null))
        ) {
            updatedTableTabCount += 1;
        }
    }

    const beforeOrder = beforeTabs
        .filter(tab => afterById.has(tab.tabId))
        .map(tab => tab.tabId)
        .join('\0');
    const afterOrder = afterTabs
        .filter(tab => beforeById.has(tab.tabId))
        .map(tab => tab.tabId)
        .join('\0');
    const reordered = beforeOrder !== afterOrder && beforeTabs.length > 1 && afterTabs.length > 1;
    const changeSummary = [
        addedTabs.length ? `Added ${addedTabs.length} ${addedTabs.length === 1 ? 'tab' : 'tabs'}${tabNames(addedTabs) ? `: ${tabNames(addedTabs)}` : ''}` : null,
        removedTabs.length ? `Removed ${removedTabs.length} ${removedTabs.length === 1 ? 'tab' : 'tabs'}${tabNames(removedTabs) ? `: ${tabNames(removedTabs)}` : ''}` : null,
        renamedTabCount ? `Renamed ${renamedTabCount} ${renamedTabCount === 1 ? 'tab' : 'tabs'}` : null,
        editedSqlTabCount ? `Edited SQL in ${editedSqlTabCount} ${editedSqlTabCount === 1 ? 'tab' : 'tabs'}` : null,
        updatedTableTabCount ? `Updated ${updatedTableTabCount} table ${updatedTableTabCount === 1 ? 'tab' : 'tabs'}` : null,
        reordered ? 'Reordered tabs' : null,
    ].filter((item): item is string => Boolean(item));

    return {
        changed: changeSummary.length > 0,
        changeSummary,
        addedTabCount: addedTabs.length,
        removedTabCount: removedTabs.length,
        renamedTabCount,
        editedSqlTabCount,
        updatedTableTabCount,
        reordered,
    };
}

export default function AgentWorkspaceClient({
    defaultLayout = INITIAL_LAYOUT.horizontal.default,
    organization,
    workId,
    connectionId,
}: {
    defaultLayout: number[] | undefined;
    organization: string;
    workId: string;
    connectionId: string;
}) {
    const workspaceScope = useMemo<SqlWorkspaceScope>(
        () => ({
            workspaceMode: 'agent',
            workId,
            connectionId,
        }),
        [connectionId, workId],
    );
    const {
        normalizedLayout,
        onLayout: onLayoutFromHook,
        editorRef,
        tabs,
        activeTab,
        activeTabId,
        setActiveTabId,
        isLoading,
        updateTab,
        addTab,
        reorderTabs,
        runQuery,
        cancelQuery,
        runningTabs,
        manualRenameTab,
        handleOpenTableTab,
        handleCloseTab,
        handleCloseOthers,
        saveWorkspaceNow,
    } = useSqlConsoleClient(defaultLayout, workspaceScope);
    const t = useTranslations('SqlConsole');
    const tAgentRuns = useTranslations('AgentRuns');
    const router = useRouter();
    const setWorkspaceScope = useSetAtom(sqlWorkspaceScopeAtom);

    const horizontalLayout = useMemo(() => normalizeHorizontalLayout(normalizedLayout), [normalizedLayout]);
    const [showChatbot, setShowChatbot] = useAtom(copilotPanelOpenAtom);
    const [chatWidth, setChatWidth] = useAtom(copilotPanelWidthAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const selectionByTab = useAtomValue(editorSelectionByTabAtom);
    const setInlineAskByTab = useSetAtom(inlineSqlAskByTabAtom);
    const [agentRunPanelOpen, setAgentRunPanelOpen] = useState(true);
    const shouldShowChatbot = activeTab?.tabType === 'sql' ? showChatbot && !agentRunPanelOpen : false;
    const normalizedChatWidth = useMemo(
        () => clamp(chatWidth ?? INITIAL_LAYOUT.copilot.defaultWidth, INITIAL_LAYOUT.copilot.minWidth, INITIAL_LAYOUT.copilot.maxWidth),
        [chatWidth],
    );
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [pendingSavedQuery, setPendingSavedQuery] = useState<SavedQueryItem | null>(null);
    const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
    const [closeBusy, setCloseBusy] = useState(false);
    const [closeTargetHref, setCloseTargetHref] = useState<string | null>(null);
    const [savedWorkspaceFingerprint, setSavedWorkspaceFingerprint] = useState<string | null>(null);
    const agentRunsHref = useMemo(() => `/${encodeURIComponent(organization)}/agent-runs`, [organization]);
    const agentRunDetailHref = useMemo(() => buildAgentRunDetailPath(organization, workId), [organization, workId]);

    useEffect(() => {
        setWorkspaceScope(workspaceScope);
    }, [setWorkspaceScope, workspaceScope]);

    const sqlTabIds = useMemo(() => tabs.filter(tab => tab.tabType === 'sql').map(tab => tab.tabId), [tabs]);
    const sqlTabIdKey = sqlTabIds.join('\0');
    const editorRefsByTab = useMemo(
        () => Object.fromEntries(sqlTabIds.map(tabId => [tabId, React.createRef<SQLEditorHandle>()])),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [sqlTabIdKey],
    );

    const ensureEditorRef = useCallback(
        (tabId: string | undefined | null) => {
            if (!tabId) return null;
            return editorRefsByTab[tabId] ?? null;
        },
        [editorRefsByTab],
    );

    useEffect(() => {
        if (!activeTabId) return;
        const refForActive = ensureEditorRef(activeTabId);
        if (refForActive) {
            editorRef.current = refForActive.current;
        }
    }, [activeTabId, editorRef, ensureEditorRef]);

    useEffect(() => {
        if (!activeTabId || activeTab?.tabType !== 'sql') return;

        let cancelled = false;
        let attempts = 0;

        const focusAtEnd = () => {
            if (cancelled) return;
            const refForActive = ensureEditorRef(activeTabId);
            const handle = refForActive?.current;
            if (handle?.focusAtEnd) {
                handle.focusAtEnd();
                return;
            }
            if (attempts < INITIAL_LAYOUT.editorFocusRetry.maxAttempts) {
                attempts += 1;
                setTimeout(focusAtEnd, INITIAL_LAYOUT.editorFocusRetry.delayMs);
            }
        };

        focusAtEnd();

        return () => {
            cancelled = true;
        };
    }, [activeTab?.tabType, activeTabId, ensureEditorRef]);

    const runQueryWithRef = useCallback(
        (tab: Parameters<typeof runQuery>[0], options?: Parameters<typeof runQuery>[1]) => {
            const refForTab = ensureEditorRef(tab?.tabId);
            if (refForTab) {
                editorRef.current = refForTab.current;
            }

            if (tab?.tabType === 'sql' && tab.tabId) {
                const selection = selectionByTab[tab.tabId];
                if (selection) {
                    const sqlText = editorRef.current?.getValue() ?? '';
                    const start = Math.max(0, Math.min(selection.start, sqlText.length));
                    const end = Math.max(start, Math.min(selection.end, sqlText.length));
                    const selectionText = sqlText.slice(start, end).trim();
                    if (selectionText) {
                        return runQuery(tab, { ...options, sqlOverride: selectionText });
                    }
                }
            }

            return runQuery(tab, options);
        },
        [ensureEditorRef, editorRef, runQuery, selectionByTab],
    );

    const handleOpenQueryConsole = useCallback(async () => {
        await addTab({ activate: true });
    }, [addTab]);

    const handleQueryTable = useCallback(
        async (payload: TableActionPayload) => {
            const sqlText = buildQueryTableSql({
                connectionType: currentConnection?.connection?.type,
                database: payload.database,
                schema: payload.schema,
                tableName: payload.tableName,
            });
            const tabName = t('Tabs.QueryTableTabName', { table: payload.tabLabel ?? payload.tableName });
            const tabId = await addTab({ tabName, content: sqlText, activate: true });
            const tab: SQLTab = {
                tabId,
                tabType: 'sql',
                tabName,
                content: sqlText,
                status: 'idle',
                userId: '',
                connectionId: currentConnection?.connection?.id ?? connectionId,
                workId,
                createdAt: new Date().toISOString(),
            };

            await runQueryWithRef(tab, {
                sqlOverride: sqlText,
                databaseOverride: payload.database ?? null,
            });
        },
        [addTab, connectionId, currentConnection?.connection?.id, currentConnection?.connection?.type, runQueryWithRef, t, workId],
    );

    const handleRenameTable = useCallback(
        async (payload: RenameTablePayload) => {
            const scopedConnectionId = currentConnection?.connection?.id ?? connectionId;
            if (!scopedConnectionId || !payload.database) {
                throw new Error(t('Tabs.MissingConnectionContext'));
            }

            await executeActionClient(
                'schema.renameTable',
                {
                    connectionId: scopedConnectionId,
                    database: payload.database,
                    table: payload.tableName,
                    nextName: payload.nextName,
                },
                { currentConnectionId: scopedConnectionId },
            );

            const nextTableName = applyRenamedTableName(payload.tableName, payload.nextName.trim());
            await Promise.all(
                tabs
                    .filter(tab => tab.tabType === 'table' && tab.tableName === payload.tableName && (!payload.database || tab.databaseName === payload.database))
                    .map(tab =>
                        Promise.resolve(
                            updateTab(
                                tab.tabId,
                                {
                                    tableName: nextTableName,
                                    tabName: applyRenamedTableName((tab.tabName as string | undefined) ?? payload.tableName, payload.nextName.trim()),
                                },
                                { immediate: true },
                            ),
                        ),
                    ),
            );
        },
        [connectionId, currentConnection?.connection?.id, t, tabs, updateTab],
    );

    useEffect(() => {
        if (chatWidth !== normalizedChatWidth) {
            setChatWidth(normalizedChatWidth);
        }
    }, [chatWidth, normalizedChatWidth, setChatWidth]);

    useEffect(() => {
        const liveTabIds = new Set(tabs.map(tab => tab.tabId));
        setInlineAskByTab(prev => {
            const nextEntries = Object.entries(prev).filter(([tabId]) => liveTabIds.has(tabId));
            if (nextEntries.length === Object.keys(prev).length) {
                return prev;
            }
            return Object.fromEntries(nextEntries);
        });
    }, [setInlineAskByTab, tabs]);

    const handleLayoutChange = (layout: Layout) => {
        const next = [layout['left-panel'] ?? horizontalLayout[0], layout['middle-panel'] ?? horizontalLayout[1]];
        onLayoutFromHook?.(next);
    };

    const setClampedChatWidth = useCallback(
        (size: number) => {
            setChatWidth(clamp(size, INITIAL_LAYOUT.copilot.minWidth, INITIAL_LAYOUT.copilot.maxWidth));
        },
        [setChatWidth],
    );

    const closeChatbotPanel = () => setShowChatbot(false);
    const toggleChatbotPanel = () => {
        setAgentRunPanelOpen(false);
        setShowChatbot(prev => !prev);
    };
    const toggleAgentRunPanel = () => {
        setShowChatbot(false);
        setAgentRunPanelOpen(prev => !prev);
    };

    const getSqlContentsByTabId = useCallback(() => {
        const contents: Record<string, string> = {};

        for (const tab of tabs) {
            if (tab.tabType !== 'sql') continue;

            const refForTab = ensureEditorRef(tab.tabId);
            const editorHandle = refForTab?.current ?? (tab.tabId === activeTabId ? editorRef.current : null);
            contents[tab.tabId] = editorHandle?.getValue?.() ?? tab.content ?? '';
        }

        return contents;
    }, [activeTabId, editorRef, ensureEditorRef, tabs]);

    const flushSqlEditorSaves = useCallback(() => {
        for (const tab of tabs) {
            if (tab.tabType !== 'sql') continue;
            const refForTab = ensureEditorRef(tab.tabId);
            const editorHandle = refForTab?.current ?? (tab.tabId === activeTabId ? editorRef.current : null);
            editorHandle?.flushSave?.();
        }
    }, [activeTabId, editorRef, ensureEditorRef, tabs]);

    const recordWorkspaceSaveActivity = useCallback(
        async (changes: WorkspaceChangeSummary) => {
            const sqlTabCount = tabs.filter(tab => tab.tabType === 'sql').length;
            const tableTabCount = tabs.filter(tab => tab.tabType === 'table').length;
            const response = await authFetch(`/api/works/${encodeURIComponent(workId)}/events`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    toolName: 'dory_user_save_workspace',
                    operation: 'save_workspace',
                    tabCount: tabs.length,
                    sqlTabCount,
                    tableTabCount,
                    changed: changes.changed,
                    changeSummary: changes.changeSummary,
                    addedTabCount: changes.addedTabCount,
                    removedTabCount: changes.removedTabCount,
                    renamedTabCount: changes.renamedTabCount,
                    editedSqlTabCount: changes.editedSqlTabCount,
                    updatedTableTabCount: changes.updatedTableTabCount,
                    reordered: changes.reordered,
                }),
            });

            if (!response.ok) {
                const payload = (await response.json().catch(() => null)) as { message?: string } | { error?: { message?: string } } | null;
                const message =
                    payload && 'error' in payload && payload.error?.message
                        ? payload.error.message
                        : payload && 'message' in payload && payload.message
                          ? payload.message
                          : 'Failed to record workspace activity.';
                throw new Error(message);
            }
        },
        [tabs, workId],
    );

    const saveAgentWorkspace = useCallback(async () => {
        const sqlContentsByTabId = getSqlContentsByTabId();
        const activeSqlContent = activeTab?.tabType === 'sql' ? (sqlContentsByTabId[activeTab.tabId] ?? activeTab.content ?? '') : null;
        flushSqlEditorSaves();

        await saveWorkspaceNow({
            activeTabId,
            activeSqlContent,
            sqlContentsByTabId,
        });

        const nextFingerprint = serializeWorkspaceTabs(tabs, activeTabId, activeSqlContent, sqlContentsByTabId);
        const changes = summarizeWorkspaceChanges(savedWorkspaceFingerprint, nextFingerprint);
        if (changes.changed) {
            await recordWorkspaceSaveActivity(changes);
        }

        setSavedWorkspaceFingerprint(nextFingerprint);
        return nextFingerprint;
    }, [activeTab, activeTabId, flushSqlEditorSaves, getSqlContentsByTabId, recordWorkspaceSaveActivity, saveWorkspaceNow, savedWorkspaceFingerprint, tabs]);

    const getCurrentWorkspaceFingerprint = useCallback(() => {
        const sqlContentsByTabId = getSqlContentsByTabId();
        const activeSqlContent = activeTab?.tabType === 'sql' ? (sqlContentsByTabId[activeTab.tabId] ?? activeTab.content ?? '') : null;
        return serializeWorkspaceTabs(tabs, activeTabId, activeSqlContent, sqlContentsByTabId);
    }, [activeTab, activeTabId, getSqlContentsByTabId, tabs]);

    const hasUnsavedChanges = savedWorkspaceFingerprint !== null && getCurrentWorkspaceFingerprint() !== savedWorkspaceFingerprint;

    const closeWorkspace = useCallback(
        (targetHref?: string | null) => {
            if (targetHref) {
                if (typeof window !== 'undefined' && window.history.length > 1) {
                    router.back();
                    window.setTimeout(() => {
                        router.replace(targetHref, { scroll: false });
                    }, 0);
                    return;
                }

                router.replace(targetHref, { scroll: false });
                return;
            }

            if (typeof window !== 'undefined' && window.history.length > 1) {
                router.back();
                return;
            }
            router.replace(agentRunDetailHref, { scroll: false });
        },
        [agentRunDetailHref, router],
    );

    const requestCloseTo = useCallback(
        (targetHref?: string | null) => {
            if (savedWorkspaceFingerprint !== null && getCurrentWorkspaceFingerprint() !== savedWorkspaceFingerprint) {
                setCloseTargetHref(targetHref ?? null);
                setCloseConfirmOpen(true);
                return;
            }

            closeWorkspace(targetHref);
        },
        [closeWorkspace, getCurrentWorkspaceFingerprint, savedWorkspaceFingerprint],
    );

    const closeWorkspaceToAgentRuns = useCallback(() => {
        requestCloseTo(agentRunsHref);
    }, [agentRunsHref, requestCloseTo]);

    const requestCloseWorkspace = useCallback(() => {
        requestCloseTo(null);
    }, [requestCloseTo]);

    const saveAndCloseWorkspace = useCallback(async () => {
        setCloseBusy(true);
        try {
            await saveAgentWorkspace();
            setCloseConfirmOpen(false);
            closeWorkspace(closeTargetHref);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to save workspace.';
            toast.error(message);
        } finally {
            setCloseBusy(false);
        }
    }, [closeTargetHref, closeWorkspace, saveAgentWorkspace]);

    const closeWorkspaceWithoutSaving = useCallback(() => {
        setCloseConfirmOpen(false);
        closeWorkspace(closeTargetHref);
    }, [closeTargetHref, closeWorkspace]);

    const reservedRightWidth = WORKSPACE_RAIL_WIDTH + (agentRunPanelOpen ? AGENT_RUN_PANEL_WIDTH : 0);
    const workspaceStyle = {
        '--agent-run-panel-width': `${AGENT_RUN_PANEL_WIDTH}px`,
        '--workspace-rail-width': `${WORKSPACE_RAIL_WIDTH}px`,
        '--workspace-reserved-right-width': `${reservedRightWidth}px`,
    } as React.CSSProperties;

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const isOpenShortcut = event.key.toLowerCase() === 'i' && (event.metaKey || event.ctrlKey);
            if (!isOpenShortcut) return;
            if (activeTab?.tabType !== 'sql') return;
            event.preventDefault();
            setShowChatbot(prev => !prev);
        };
        window.addEventListener('keydown', handler);
        return () => {
            window.removeEventListener('keydown', handler);
        };
    }, [activeTab?.tabType, setShowChatbot]);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const isNewTabShortcut = event.code === 'KeyL' && event.altKey && (event.metaKey || event.ctrlKey);
            if (!isNewTabShortcut) return;
            event.preventDefault();
            void addTab({ activate: true });
        };
        window.addEventListener('keydown', handler);
        return () => {
            window.removeEventListener('keydown', handler);
        };
    }, [addTab]);

    useEffect(() => {
        if (isLoading || savedWorkspaceFingerprint !== null) return;
        setSavedWorkspaceFingerprint(serializeWorkspaceTabs(tabs, activeTabId, activeTab?.tabType === 'sql' ? (activeTab.content ?? '') : null));
    }, [activeTab, activeTabId, isLoading, savedWorkspaceFingerprint, tabs]);

    const applySavedQuery = useCallback(
        async (item: SavedQueryItem) => {
            const sqlText = item.sqlText ?? '';
            if (!sqlText.trim()) return;

            if (!activeTabId) {
                await addTab({ tabName: item.title, content: sqlText, activate: true });
                return;
            }

            if (!activeTab || activeTab.tabType !== 'sql') {
                await addTab({ tabName: item.title, content: sqlText, activate: true });
                return;
            }

            editorRef.current?.applyContentWithUndo?.(sqlText);
            updateTab(activeTabId, { content: sqlText }, { immediate: true });
        },
        [activeTab, activeTabId, addTab, editorRef, updateTab],
    );

    const handleSavedQuerySelect = useCallback(
        async (item: SavedQueryItem) => {
            const sqlText = item.sqlText ?? '';
            if (!sqlText.trim()) return;
            const normalized = sqlText.trim();
            const existing = tabs.find(tab => tab.tabType === 'sql' && (tab.content ?? '').trim() === normalized);
            if (existing) {
                setActiveTabId(existing.tabId);
                return;
            }

            if (!activeTabId) {
                await addTab({ tabName: item.title, content: sqlText, activate: true });
                return;
            }

            if (!activeTab || activeTab.tabType !== 'sql') {
                await addTab({ tabName: item.title, content: sqlText, activate: true });
                return;
            }

            const current = editorRef.current?.getValue() ?? activeTab.content ?? '';
            const hasContent = current.trim().length > 0 && current.trim() !== sqlText.trim();
            if (hasContent) {
                setPendingSavedQuery(item);
                setConfirmOpen(true);
                return;
            }

            await applySavedQuery(item);
        },
        [activeTab, activeTabId, addTab, applySavedQuery, editorRef, setActiveTabId, tabs],
    );

    return (
        <main className="relative h-full w-full min-w-0 max-w-full overflow-hidden" style={workspaceStyle}>
            <div className="absolute inset-y-0 left-0 right-[var(--workspace-rail-width)] transition-[right] duration-200 ease-out xl:right-[var(--workspace-reserved-right-width)]">
                <Group
                    orientation="horizontal"
                    id="agent-workspace-horizontal"
                    defaultLayout={{ 'left-panel': horizontalLayout[0], 'middle-panel': horizontalLayout[1] }}
                    onLayoutChanged={handleLayoutChange}
                >
                    <Panel id="left-panel" minSize={`${INITIAL_LAYOUT.horizontal.leftPanel.min}%`} maxSize={`${INITIAL_LAYOUT.horizontal.leftPanel.max}%`} className="min-w-0 overflow-hidden">
                        <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden bg-card">
                            <Tabs defaultValue="tables" className="w-full min-w-0 max-w-full flex-1 overflow-hidden">
                                <TabsList className="w-full min-w-0 max-w-full rounded-none px-2">
                                    <TabsTrigger value="tables" className="min-w-0 flex-1">
                                        {t('Sidebar.Tables')}
                                    </TabsTrigger>
                                    <TabsTrigger value="saved" className="min-w-0 flex-1">
                                        {t('Sidebar.Queries')}
                                    </TabsTrigger>
                                </TabsList>
                                <TabsContent value="tables" className="min-h-0 w-full min-w-0 max-w-full flex-1 overflow-hidden">
                                    <SQLConsoleSidebar
                                        onOpenTableTab={handleOpenTableTab}
                                        onOpenQueryConsole={handleOpenQueryConsole}
                                        onQueryTable={handleQueryTable}
                                        onRenameTable={handleRenameTable}
                                        selectedTable={activeTab?.tabType === 'table' ? activeTab.tableName : undefined}
                                        selectedDatabase={activeTab?.tabType === 'table' ? activeTab.databaseName : undefined}
                                    />
                                </TabsContent>
                                <TabsContent value="saved" className="min-h-0 w-full min-w-0 max-w-full flex-1 overflow-hidden">
                                    <SavedQueriesSidebar onSelect={handleSavedQuerySelect} />
                                </TabsContent>
                            </Tabs>
                        </div>
                    </Panel>

                    <PanelSeparator className="w-1.5 bg-border transition-colors" />

                    <Panel id="middle-panel" minSize={`${INITIAL_LAYOUT.horizontal.middlePanel.min}%`}>
                        <div className="flex h-full flex-col">
                            {isLoading || tabs.length === 0 ? (
                                <SQLTabEmpty addTab={addTab} disabled={isLoading} />
                            ) : (
                                <>
                                    <SQLTabs
                                        tabs={tabs}
                                        activeTabId={activeTabId}
                                        setActiveTabId={setActiveTabId}
                                        addTab={addTab}
                                        closeTab={handleCloseTab}
                                        closeOtherTabs={handleCloseOthers}
                                        updateTab={updateTab}
                                        reorderTabs={reorderTabs}
                                        onRequestAITitle={manualRenameTab}
                                    />
                                    <div className="flex-1 min-h-0">
                                        {tabs.map(tab => {
                                            const isActive = tab.tabId === activeTabId;
                                            const tabEditorRef = tab.tabType === 'sql' ? (ensureEditorRef(tab.tabId) ?? editorRef) : editorRef;

                                            return (
                                                <Activity key={tab.tabId} mode={isActive ? 'visible' : 'hidden'}>
                                                    <div className={cn('flex h-full flex-col', isActive ? '' : 'hidden')}>
                                                        {tab.tabType === 'table' ? (
                                                            <TableMode
                                                                tabs={tabs}
                                                                activeTab={tab}
                                                                activeTabId={tab.tabId}
                                                                setActiveTabId={setActiveTabId}
                                                                addTab={addTab}
                                                                updateTab={updateTab}
                                                                showChatbot={false}
                                                                chatWidth={normalizedChatWidth}
                                                                setChatWidth={setClampedChatWidth}
                                                                runQuery={runQueryWithRef}
                                                                onCloseChatbot={closeChatbotPanel}
                                                                reserveRightRail={false}
                                                            />
                                                        ) : (
                                                            <SqlMode
                                                                tabs={tabs}
                                                                activeTab={tab}
                                                                activeTabId={tab.tabId}
                                                                setActiveTabId={setActiveTabId}
                                                                addTab={addTab}
                                                                updateTab={updateTab}
                                                                editorRef={tabEditorRef}
                                                                runQuery={runQueryWithRef}
                                                                cancelQuery={cancelQuery}
                                                                runningTabs={runningTabs}
                                                                showChatbot={shouldShowChatbot}
                                                                chatWidth={normalizedChatWidth}
                                                                setChatWidth={setClampedChatWidth}
                                                                onCloseChatbot={closeChatbotPanel}
                                                                reserveRightRail={false}
                                                            />
                                                        )}
                                                    </div>
                                                </Activity>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    </Panel>
                </Group>
            </div>

            <div className="absolute bottom-0 right-0 top-0 z-20 flex">
                <div className="flex h-full w-10 flex-col items-center gap-2 border-l bg-background/95 py-3 shadow-xl backdrop-blur">
                    {activeTab?.tabType === 'sql' && (
                        <Button
                            size="icon"
                            variant={shouldShowChatbot ? 'default' : 'ghost'}
                            className="group h-8 w-8"
                            onClick={toggleChatbotPanel}
                            title={shouldShowChatbot ? t('Copilot.ToggleClose') : t('Copilot.ToggleOpen')}
                            aria-label={t('Copilot.ToggleAria')}
                        >
                            <Sparkles className={cn('h-5 w-5 transition-colors', shouldShowChatbot ? 'text-background' : 'text-muted-foreground group-hover:text-[#9460FF]')} />
                            <span className="sr-only">{t('Copilot.ToggleLabel')}</span>
                        </Button>
                    )}
                    <Button
                        size="icon"
                        variant={agentRunPanelOpen ? 'default' : 'ghost'}
                        className="group h-8 w-8"
                        onClick={toggleAgentRunPanel}
                        title={agentRunPanelOpen ? tAgentRuns('WorkspacePanel.Rail.Close') : tAgentRuns('WorkspacePanel.Rail.Open')}
                        aria-label={agentRunPanelOpen ? tAgentRuns('WorkspacePanel.Rail.Close') : tAgentRuns('WorkspacePanel.Rail.Open')}
                    >
                        <Bot className={cn('h-5 w-5 transition-colors', agentRunPanelOpen ? 'text-background' : 'text-muted-foreground group-hover:text-primary')} />
                        <span className="sr-only">{tAgentRuns('Common.AgentRun')}</span>
                    </Button>
                </div>
            </div>

            {agentRunPanelOpen ? (
                <div className="absolute bottom-0 right-[var(--workspace-rail-width)] top-0 z-10 w-[var(--agent-run-panel-width)] max-w-[calc(100%_-_var(--workspace-rail-width))]">
                    <AgentRunWorkspacePanel
                        workId={workId}
                        connectionId={connectionId}
                        connectionName={currentConnection?.connection?.name ?? connectionId}
                        workspaceUrl={typeof window !== 'undefined' ? window.location.href : null}
                        tabCount={tabs.length}
                        onSaveWorkspace={async () => {
                            await saveAgentWorkspace();
                        }}
                        hasUnsavedChanges={hasUnsavedChanges}
                        onRequestCloseWorkspace={requestCloseWorkspace}
                        onOpenAgentRuns={closeWorkspaceToAgentRuns}
                        onSelectGeneratedTab={setActiveTabId}
                        activeTabId={activeTabId}
                        onSaveAndCloseWorkspace={saveAndCloseWorkspace}
                        onCloseWorkspaceWithoutSaving={closeWorkspaceWithoutSaving}
                    />
                </div>
            ) : null}

            <AlertDialog open={confirmOpen} onOpenChange={open => setConfirmOpen(open)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('SavedQueries.OverrideTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('SavedQueries.OverrideDescription')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            onClick={() => {
                                setConfirmOpen(false);
                                setPendingSavedQuery(null);
                            }}
                        >
                            {t('Actions.Cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                const next = pendingSavedQuery;
                                setConfirmOpen(false);
                                setPendingSavedQuery(null);
                                if (next) await applySavedQuery(next);
                            }}
                        >
                            {t('SavedQueries.Override')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={closeConfirmOpen} onOpenChange={open => !closeBusy && setCloseConfirmOpen(open)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Close workspace?</AlertDialogTitle>
                        <AlertDialogDescription>This workspace has unsaved changes.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={closeBusy}>Cancel</AlertDialogCancel>
                        <Button variant="outline" disabled={closeBusy} onClick={closeWorkspaceWithoutSaving}>
                            Close without saving
                        </Button>
                        <Button disabled={closeBusy} onClick={() => void saveAndCloseWorkspace()}>
                            Save and close
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </main>
    );
}
