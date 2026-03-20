'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FolderPlus, GripVertical, MoreHorizontal, RefreshCw } from 'lucide-react';
import {
    DndContext,
    DragOverlay,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import type { Modifier } from '@dnd-kit/core';

import { Button } from '@/registry/new-york-v4/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/registry/new-york-v4/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/registry/new-york-v4/ui/dialog';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/registry/new-york-v4/ui/hover-card';
import { Input } from '@/registry/new-york-v4/ui/input';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';
import { SmartCodeBlock } from '@/components/@dory/ui/code-block/code-block';
import { authFetch } from '@/lib/client/auth-fetch';
import { cn } from '@/lib/utils';
import { useAtomValue } from 'jotai';
import { useLocale, useTranslations } from 'next-intl';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import posthog from 'posthog-js';
import { FolderItem, type FolderData } from './folder-item';
import { CreateFolderDialog } from './create-folder-dialog';
import { MoveToFolderDialog } from './move-to-folder-dialog';

export type SavedQueryItem = {
    id: string;
    title: string;
    description?: string | null;
    sqlText: string;
    context?: Record<string, unknown> | null;
    tags?: string[] | null;
    workId?: string | null;
    userId?: string | null;
    connectionId?: string | null;
    folderId?: string | null;
    position?: number | null;
    createdAt?: string | Date | null;
    updatedAt?: string | Date | null;
    archivedAt?: string | Date | null;
};

function formatTime(value: string | Date | null | undefined, locale: string) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(locale);
}

type SavedQueriesSidebarProps = {
    onSelect?: (item: SavedQueryItem) => void;
};

function summarizeSql(sqlText: string) {
    return sqlText.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Sortable wrappers
// ---------------------------------------------------------------------------
function createRestrictToContainer(containerRef: React.RefObject<HTMLDivElement | null>): Modifier {
    return ({ transform, draggingNodeRect }) => {
        const container = containerRef.current;
        if (!container || !draggingNodeRect) return transform;
        const containerRect = container.getBoundingClientRect();
        const clampedY = Math.min(
            Math.max(transform.y, containerRect.top - draggingNodeRect.top),
            containerRect.bottom - draggingNodeRect.bottom,
        );
        return { ...transform, y: clampedY };
    };
}

function SortableFolderWrapper({ id, children }: {
    id: string;
    children: (props: { listeners: Record<string, Function>; attributes: Record<string, any>; isDragging: boolean }) => React.ReactNode;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = { transform: CSS.Transform.toString(transform), transition };
    return (
        <div ref={setNodeRef} style={style}>
            {children({ listeners: listeners ?? {}, attributes, isDragging })}
        </div>
    );
}

function FolderQueryDndWrapper({ sensors, folderItems, onDragStart, onDragEnd, activeQueryForOverlay, renderQueryItem }: {
    sensors: ReturnType<typeof useSensors>;
    folderItems: SavedQueryItem[];
    onDragStart: (event: DragStartEvent) => void;
    onDragEnd: (event: DragEndEvent) => void;
    activeQueryForOverlay: SavedQueryItem | null | undefined;
    renderQueryItem: (item: SavedQueryItem, dragProps?: { listeners: Record<string, Function>; attributes: Record<string, any> }) => React.ReactNode;
}) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const modifiers = useMemo(() => [restrictToVerticalAxis, createRestrictToContainer(containerRef)], []);
    return (
        <div ref={containerRef}>
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={modifiers}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
            >
                <SortableContext items={folderItems.map(q => q.id)} strategy={verticalListSortingStrategy}>
                    {folderItems.map(item => (
                        <SortableQueryWrapper key={item.id} id={item.id}>
                            {({ listeners, attributes }) => renderQueryItem(item, { listeners, attributes })}
                        </SortableQueryWrapper>
                    ))}
                </SortableContext>
                <DragOverlay dropAnimation={null}>
                    {activeQueryForOverlay && (
                        <div className="rounded-md border bg-background px-3 py-1.5 shadow-md">
                            <div className="text-sm font-medium truncate max-w-[200px]">{activeQueryForOverlay.title}</div>
                            <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                                {summarizeSql(activeQueryForOverlay.sqlText ?? '')}
                            </div>
                        </div>
                    )}
                </DragOverlay>
            </DndContext>
        </div>
    );
}

function SortableQueryWrapper({ id, children }: {
    id: string;
    children: (props: { listeners: Record<string, Function>; attributes: Record<string, any>; isDragging: boolean }) => React.ReactNode;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : undefined };
    return (
        <div ref={setNodeRef} style={style}>
            {children({ listeners: listeners ?? {}, attributes, isDragging })}
        </div>
    );
}

const EXPANDED_FOLDERS_KEY = 'dory:saved-query-folders:expanded';

function loadExpandedFolders(): Set<string> {
    try {
        const raw = localStorage.getItem(EXPANDED_FOLDERS_KEY);
        if (raw) return new Set(JSON.parse(raw));
    } catch { /* ignore */ }
    return new Set();
}

function saveExpandedFolders(set: Set<string>) {
    try {
        localStorage.setItem(EXPANDED_FOLDERS_KEY, JSON.stringify([...set]));
    } catch { /* ignore */ }
}

export function SavedQueriesSidebar({ onSelect }: SavedQueriesSidebarProps) {
    const t = useTranslations('SqlConsole');
    const locale = useLocale();
    const currentConnection = useAtomValue(currentConnectionAtom);
    const connectionId = currentConnection?.connection.id ?? null;
    const scrollRootRef = useRef<HTMLDivElement | null>(null);
    const scrollRestoreRef = useRef<{ top: number } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [items, setItems] = useState<SavedQueryItem[]>([]);
    const [folders, setFolders] = useState<FolderData[]>([]);
    const [limit, setLimit] = useState(50);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [renameOpen, setRenameOpen] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [renameTarget, setRenameTarget] = useState<SavedQueryItem | null>(null);
    const [renameSaving, setRenameSaving] = useState(false);
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const [hoverOpenId, setHoverOpenId] = useState<string | null>(null);
    const [searchValue, setSearchValue] = useState('');
    const [hoverBlockOnceId, setHoverBlockOnceId] = useState<string | null>(null);

    // Folder-specific state
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(loadExpandedFolders);
    const [createFolderOpen, setCreateFolderOpen] = useState(false);
    const [renameFolderOpen, setRenameFolderOpen] = useState(false);
    const [renameFolderTarget, setRenameFolderTarget] = useState<FolderData | null>(null);
    const [renameFolderValue, setRenameFolderValue] = useState('');
    const [renameFolderSaving, setRenameFolderSaving] = useState(false);
    const [moveTarget, setMoveTarget] = useState<SavedQueryItem | null>(null);
    const [moveDialogOpen, setMoveDialogOpen] = useState(false);

    const notifySavedQueriesUpdated = useCallback(() => {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(new CustomEvent('saved-queries-updated'));
    }, []);

    const toggleFolder = useCallback((folderId: string) => {
        setExpandedFolders(prev => {
            const next = new Set(prev);
            if (next.has(folderId)) next.delete(folderId);
            else next.add(folderId);
            saveExpandedFolders(next);
            return next;
        });
    }, []);

    const fetchFolders = useCallback(async () => {
        try {
            const res = await authFetch('/api/sql-console/saved-query-folders');
            const data = await res.json().catch(() => null);
            if (res.ok && data?.code === 0) {
                setFolders(data.data ?? []);
            }
        } catch { /* ignore */ }
    }, []);

    const fetchList = useCallback(async (nextLimit: number, options?: { silent?: boolean }) => {
        if (!options?.silent) setLoading(true);
        setError(null);
        if (!connectionId) {
            const message = t('Api.SqlConsole.Tabs.MissingConnectionContext');
            setError(message);
            setItems([]);
            setHasMore(false);
            if (!options?.silent) setLoading(false);
            return;
        }
        try {
            const res = await authFetch(`/api/sql-console/saved-queries?limit=${nextLimit}`, {
                headers: {
                    'X-Connection-ID': connectionId,
                },
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || (data && data.code !== 0)) {
                throw new Error(data?.message ?? t('SavedQueries.LoadFailed'));
            }
            const nextItems = (data?.data ?? []) as SavedQueryItem[];
            setItems(nextItems);
            setHasMore(nextItems.length >= nextLimit);
        } catch (err) {
            const message = err instanceof Error ? err.message : t('SavedQueries.LoadFailed');
            setError(message);
            setItems([]);
            setHasMore(false);
        } finally {
            if (!options?.silent) setLoading(false);
        }
    }, [t, connectionId]);

    const fetchAll = useCallback((nextLimit?: number) => {
        fetchFolders();
        fetchList(nextLimit ?? 50);
    }, [fetchFolders, fetchList]);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    useEffect(() => {
        const handler = () => {
            setLimit(50);
            setHasMore(true);
            fetchAll();
        };
        window.addEventListener('saved-queries-updated', handler);
        return () => {
            window.removeEventListener('saved-queries-updated', handler);
        };
    }, [fetchAll]);

    // Group items by folder
    const { folderQueryMap, rootItems } = useMemo(() => {
        const keyword = searchValue.trim().toLowerCase();
        const filtered = keyword
            ? items.filter(item => {
                  const title = item.title?.toLowerCase() ?? '';
                  const sql = item.sqlText?.toLowerCase() ?? '';
                  return title.includes(keyword) || sql.includes(keyword);
              })
            : items;

        const map = new Map<string, SavedQueryItem[]>();
        const root: SavedQueryItem[] = [];

        for (const item of filtered) {
            if (keyword) {
                // When searching, show flat list
                root.push(item);
            } else if (item.folderId) {
                const list = map.get(item.folderId) ?? [];
                list.push(item);
                map.set(item.folderId, list);
            } else {
                root.push(item);
            }
        }

        return { folderQueryMap: map, rootItems: root };
    }, [items, searchValue]);

    const isSearching = searchValue.trim().length > 0;

    const emptyHint = useMemo(() => {
        if (loading) return t('SavedQueries.Loading');
        if (error) return error;
        if (isSearching) return t('SavedQueries.SearchEmpty');
        return t('SavedQueries.Empty');
    }, [loading, error, t, isSearching]);

    const handleLoadMore = useCallback(() => {
        if (loading || loadingMore || !hasMore) return;
        const viewport = scrollRootRef.current?.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement | null;
        if (viewport) {
            scrollRestoreRef.current = { top: viewport.scrollTop };
        }
        const nextLimit = limit + 50;
        setLoadingMore(true);
        setLimit(nextLimit);
        fetchList(nextLimit, { silent: true }).finally(() => setLoadingMore(false));
    }, [fetchList, hasMore, limit, loading, loadingMore]);

    useLayoutEffect(() => {
        if (!scrollRestoreRef.current) return;
        const viewport = scrollRootRef.current?.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement | null;
        if (!viewport) return;
        viewport.scrollTop = scrollRestoreRef.current.top;
        scrollRestoreRef.current = null;
    }, [items]);

    useEffect(() => {
        const root = scrollRootRef.current;
        if (!root) return;
        const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement | null;
        if (!viewport) return;

        const onScroll = () => {
            if (loading || loadingMore || !hasMore) return;
            const remaining = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
            if (remaining < 80) {
                handleLoadMore();
            }
        };

        viewport.addEventListener('scroll', onScroll);
        return () => {
            viewport.removeEventListener('scroll', onScroll);
        };
    }, [handleLoadMore, hasMore, loading, loadingMore]);

    const commitPatch = useCallback(
        async (itemId: string, patch: Partial<SavedQueryItem>) => {
            if (!connectionId) {
                const message = t('Api.SqlConsole.Tabs.MissingConnectionContext');
                setError(message);
                return;
            }
            try {
                const res = await authFetch(`/api/sql-console/saved-queries?id=${itemId}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Connection-ID': connectionId,
                    },
                    body: patch ? JSON.stringify(patch) : undefined,
                });
                const data = await res.json().catch(() => null);
                if (!res.ok || (data && data.code !== 0)) {
                    throw new Error(data?.message ?? t('SavedQueries.LoadFailed'));
                }
                const updated = (data?.data ?? patch) as SavedQueryItem;
                setItems(prev => prev.map(item => (item.id === itemId ? { ...item, ...updated } : item)));
                notifySavedQueriesUpdated();
            } catch (err) {
                const message = err instanceof Error ? err.message : t('SavedQueries.LoadFailed');
                setError(message);
            }
        },
        [t, connectionId, notifySavedQueriesUpdated],
    );

    const handleDelete = async (item: SavedQueryItem) => {
        if (!connectionId) {
            const message = t('Api.SqlConsole.Tabs.MissingConnectionContext');
            setError(message);
            return;
        }
        try {
            const res = await authFetch(`/api/sql-console/saved-queries?id=${item.id}`, {
                method: 'DELETE',
                headers: {
                    'X-Connection-ID': connectionId,
                },
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || (data && data.code !== 0)) {
                throw new Error(data?.message ?? t('SavedQueries.LoadFailed'));
            }
            setItems(prev => prev.filter(entry => entry.id !== item.id));
            posthog.capture('saved_query_deleted', { query_id: item.id, connection_id: connectionId });
            notifySavedQueriesUpdated();
        } catch (err) {
            const message = err instanceof Error ? err.message : t('SavedQueries.LoadFailed');
            setError(message);
        }
    };

    const openRename = (item: SavedQueryItem) => {
        setRenameTarget(item);
        setRenameValue(item.title ?? '');
        setRenameOpen(true);
        setMenuOpenId(null);
        setHoverOpenId(null);
        setHoverBlockOnceId(null);
    };

    const handleRenameSubmit = async () => {
        if (!renameTarget) return;
        if (renameSaving) return;
        const next = renameValue.trim();
        if (!next || next === renameTarget.title) {
            setRenameOpen(false);
            return;
        }
        setRenameSaving(true);
        try {
            await commitPatch(renameTarget.id, { title: next });
            setRenameOpen(false);
        } finally {
            setRenameSaving(false);
        }
    };

    // Folder actions
    const handleCreateFolder = async (name: string) => {
        const res = await authFetch('/api/sql-console/saved-query-folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || (data && data.code !== 0)) {
            throw new Error(data?.message ?? t('SavedQueries.LoadFailed'));
        }
        await fetchFolders();
    };

    const openRenameFolder = (folder: FolderData) => {
        setRenameFolderTarget(folder);
        setRenameFolderValue(folder.name);
        setRenameFolderOpen(true);
    };

    const handleRenameFolderSubmit = async () => {
        if (!renameFolderTarget || renameFolderSaving) return;
        const next = renameFolderValue.trim();
        if (!next || next === renameFolderTarget.name) {
            setRenameFolderOpen(false);
            return;
        }
        setRenameFolderSaving(true);
        try {
            const res = await authFetch(`/api/sql-console/saved-query-folders?id=${renameFolderTarget.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: next }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || (data && data.code !== 0)) {
                throw new Error(data?.message ?? t('SavedQueries.LoadFailed'));
            }
            await fetchFolders();
            setRenameFolderOpen(false);
        } finally {
            setRenameFolderSaving(false);
        }
    };

    const handleDeleteFolder = async (folder: FolderData) => {
        if (!confirm(t('SavedQueries.Folders.DeleteFolderConfirm'))) return;
        try {
            const res = await authFetch(`/api/sql-console/saved-query-folders?id=${folder.id}`, {
                method: 'DELETE',
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || (data && data.code !== 0)) {
                throw new Error(data?.message ?? t('SavedQueries.LoadFailed'));
            }
            await fetchFolders();
            // Refresh queries since folderId was reset to null
            await fetchList(limit);
        } catch (err) {
            const message = err instanceof Error ? err.message : t('SavedQueries.LoadFailed');
            setError(message);
        }
    };

    const openMoveToFolder = (item: SavedQueryItem) => {
        setMoveTarget(item);
        setMoveDialogOpen(true);
        setMenuOpenId(null);
        setHoverOpenId(null);
    };

    const handleMoveToFolder = async (folderId: string | null) => {
        if (!moveTarget) return;
        await commitPatch(moveTarget.id, { folderId });
    };

    // -----------------------------------------------------------------------
    // DnD: folder reorder
    // -----------------------------------------------------------------------
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
    const foldersContainerRef = useRef<HTMLDivElement | null>(null);
    const foldersModifiers = useMemo(() => [restrictToVerticalAxis, createRestrictToContainer(foldersContainerRef)], []);
    const rootQueriesContainerRef = useRef<HTMLDivElement | null>(null);
    const rootQueriesModifiers = useMemo(() => [restrictToVerticalAxis, createRestrictToContainer(rootQueriesContainerRef)], []);
    const [activeFolderDragId, setActiveFolderDragId] = useState<string | null>(null);
    const folderIds = useMemo(() => folders.map(f => f.id), [folders]);

    const handleFolderDragStart = useCallback((event: DragStartEvent) => {
        setActiveFolderDragId(String(event.active.id));
        setHoverOpenId(null);
    }, []);

    const handleFolderDragEnd = useCallback(async (event: DragEndEvent) => {
        setActiveFolderDragId(null);
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = folders.findIndex(f => f.id === String(active.id));
        const newIndex = folders.findIndex(f => f.id === String(over.id));
        if (oldIndex < 0 || newIndex < 0) return;
        const reordered = arrayMove(folders, oldIndex, newIndex);
        setFolders(reordered);
        try {
            await authFetch('/api/sql-console/saved-query-folders/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderedIds: reordered.map(f => f.id) }),
            });
        } catch { /* optimistic update */ }
    }, [folders]);

    const activeFolderForOverlay = useMemo(
        () => activeFolderDragId ? folders.find(f => f.id === activeFolderDragId) : null,
        [activeFolderDragId, folders],
    );

    // -----------------------------------------------------------------------
    // DnD: query reorder within a scope
    // -----------------------------------------------------------------------
    const [activeQueryDragId, setActiveQueryDragId] = useState<string | null>(null);

    const handleQueryDragStart = useCallback((event: DragStartEvent) => {
        setActiveQueryDragId(String(event.active.id));
        setHoverOpenId(null);
    }, []);

    const makeQueryDragEnd = useCallback((scopeFolderId: string | null) => async (event: DragEndEvent) => {
        setActiveQueryDragId(null);
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const scopeItems = scopeFolderId
            ? (folderQueryMap.get(scopeFolderId) ?? [])
            : rootItems;
        const oldIndex = scopeItems.findIndex(q => q.id === String(active.id));
        const newIndex = scopeItems.findIndex(q => q.id === String(over.id));
        if (oldIndex < 0 || newIndex < 0) return;
        const reordered = arrayMove(scopeItems, oldIndex, newIndex);
        // Optimistic: update local items order
        setItems(prev => {
            const remaining = prev.filter(q => !reordered.some(r => r.id === q.id));
            return [...remaining, ...reordered];
        });
        try {
            await authFetch('/api/sql-console/saved-queries/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderId: scopeFolderId, orderedIds: reordered.map(q => q.id) }),
            });
        } catch { /* optimistic */ }
    }, [folderQueryMap, rootItems]);

    const activeQueryForOverlay = useMemo(
        () => activeQueryDragId ? items.find(q => q.id === activeQueryDragId) : null,
        [activeQueryDragId, items],
    );

    const hasContent = !isSearching
        ? folders.length > 0 || rootItems.length > 0
        : rootItems.length > 0;

    const renderQueryItem = (item: SavedQueryItem, dragProps?: { listeners: Record<string, Function>; attributes: Record<string, any> }) => {
        const summary = summarizeSql(item.sqlText ?? '');
        const displaySql = item.sqlText ?? '';
        const isMenuOpen = menuOpenId === item.id;
        const hoverOpen =
            hoverOpenId === item.id &&
            !isMenuOpen &&
            !renameOpen &&
            !renameFolderOpen &&
            hoverBlockOnceId !== item.id;
        return (
            <HoverCard
                key={item.id}
                open={hoverOpen}
                onOpenChange={open => {
                    if (isMenuOpen || renameOpen || renameFolderOpen) return;
                    if (open && hoverBlockOnceId === item.id) {
                        setHoverBlockOnceId(null);
                        return;
                    }
                    setHoverOpenId(open ? item.id : null);
                }}
                openDelay={200}
                closeDelay={120}
            >
                <HoverCardTrigger asChild>
                    <div
                        className={cn(
                            'group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                            'border border-transparent hover:border-muted-foreground/20 hover:bg-muted/40',
                        )}
                    >
                        {dragProps && (
                            <button
                                type="button"
                                className="shrink-0 p-0.5 mt-0.5 cursor-grab opacity-30 group-hover:opacity-60 hover:!opacity-100 active:cursor-grabbing touch-none"
                                {...dragProps.listeners}
                                {...dragProps.attributes}
                            >
                                <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                        )}
                        <button
                            type="button"
                            className="flex-1 min-w-0 text-left"
                            onClick={() => {
                                posthog.capture('saved_query_opened', { query_id: item.id, connection_id: connectionId });
                                onSelect?.(item);
                            }}
                        >
                            <div className="text-sm font-medium truncate max-w-full">{item.title}</div>
                            <div className="text-[11px] text-muted-foreground truncate max-w-full">
                                {summary || '—'}
                            </div>
                        </button>
                        <DropdownMenu
                            open={menuOpenId === item.id}
                            onOpenChange={open => {
                                setMenuOpenId(open ? item.id : null);
                                if (open) {
                                    setHoverOpenId(null);
                                } else {
                                    setHoverOpenId(null);
                                    setHoverBlockOnceId(item.id);
                                }
                            }}
                        >
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    className={cn(
                                        'shrink-0 rounded-sm p-1 transition-opacity',
                                        menuOpenId === item.id
                                            ? 'opacity-100'
                                            : 'opacity-0 group-hover:opacity-100 hover:opacity-100 focus-visible:opacity-100',
                                    )}
                                    onClick={event => {
                                        event.stopPropagation();
                                        setHoverOpenId(null);
                                    }}
                                    aria-label={t('SavedQueries.MoreActions')}
                                >
                                    <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent side="right" align="start" sideOffset={8} className="min-w-32 z-50">
                                <DropdownMenuItem onClick={() => openRename(item)}>
                                    {t('SavedQueries.Rename')}
                                </DropdownMenuItem>
                                {folders.length > 0 && (
                                    <DropdownMenuSub>
                                        <DropdownMenuSubTrigger>
                                            {t('SavedQueries.Folders.MoveToFolder')}
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent className="min-w-32">
                                            <DropdownMenuItem
                                                disabled={!item.folderId}
                                                onClick={() => {
                                                    setMenuOpenId(null);
                                                    void commitPatch(item.id, { folderId: null });
                                                }}
                                            >
                                                {t('SavedQueries.Folders.MoveToRoot')}
                                            </DropdownMenuItem>
                                            {folders.map(f => (
                                                <DropdownMenuItem
                                                    key={f.id}
                                                    disabled={item.folderId === f.id}
                                                    onClick={() => {
                                                        setMenuOpenId(null);
                                                        void commitPatch(item.id, { folderId: f.id });
                                                    }}
                                                >
                                                    {f.name}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                )}
                                {folders.length === 0 && (
                                    <DropdownMenuItem onClick={() => openMoveToFolder(item)} disabled>
                                        {t('SavedQueries.Folders.MoveToFolder')}
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                    onClick={() => {
                                        setMenuOpenId(null);
                                        void handleDelete(item);
                                    }}
                                    className="text-destructive focus:text-destructive"
                                >
                                    {t('SavedQueries.Delete')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </HoverCardTrigger>
                <HoverCardContent
                    side="right"
                    align="start"
                    sideOffset={12}
                    className="w-[420px] p-0 z-40"
                >
                    <div className="space-y-4 p-4">
                        <div className="space-y-1">
                            <div className="text-lg font-semibold text-foreground">{item.title}</div>
                            <div className="text-xs text-muted-foreground">
                                {formatTime(item.updatedAt || item.createdAt, locale)}
                            </div>
                        </div>
                        <SmartCodeBlock
                            value={displaySql || ' '}
                            type="sql"
                            maxHeightClassName="max-h-64"
                        />
                    </div>
                </HoverCardContent>
            </HoverCard>
        );
    };

    return (
        <div className="flex h-full flex-col min-h-0 gap-2 px-2 pb-3 pt-1">
            <div className="flex items-center gap-2 px-1">
                <Input
                    value={searchValue}
                    onChange={event => setSearchValue(event.target.value)}
                    placeholder={t('SavedQueries.SearchPlaceholder')}
                    className="h-8"
                />
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setCreateFolderOpen(true)}
                    title={t('SavedQueries.Folders.CreateFolder')}
                >
                    <FolderPlus className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                        setLimit(50);
                        setHasMore(true);
                        fetchAll();
                    }}
                    disabled={loading}
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </div>
            <div ref={scrollRootRef} className="flex-1 min-h-0">
                <ScrollArea className="h-full pr-2">
                    {!hasContent ? (
                        <div className="text-xs text-muted-foreground py-6 text-center">{emptyHint}</div>
                    ) : isSearching ? (
                        <div className="space-y-1">
                            {rootItems.map(item => renderQueryItem(item))}
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {/* Folders with DnD reorder */}
                            <div ref={foldersContainerRef}>
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                modifiers={foldersModifiers}
                                onDragStart={handleFolderDragStart}
                                onDragEnd={handleFolderDragEnd}
                            >
                                <SortableContext items={folderIds} strategy={verticalListSortingStrategy}>
                                    {folders.map(folder => {
                                        const folderItems = folderQueryMap.get(folder.id) ?? [];
                                        const isExpanded = expandedFolders.has(folder.id);
                                        return (
                                            <SortableFolderWrapper key={folder.id} id={folder.id}>
                                                {({ listeners, attributes, isDragging }) => (
                                                    <FolderItem
                                                        folder={folder}
                                                        expanded={isExpanded}
                                                        onToggle={() => toggleFolder(folder.id)}
                                                        onRename={openRenameFolder}
                                                        onDelete={handleDeleteFolder}
                                                        t={t}
                                                        dragHandleListeners={listeners}
                                                        dragHandleAttributes={attributes}
                                                        isDragging={isDragging}
                                                    >
                                                        {folderItems.length === 0 ? (
                                                            <div className="text-xs text-muted-foreground py-2 px-2">
                                                                {t('SavedQueries.Folders.EmptyFolder')}
                                                            </div>
                                                        ) : (
                                                            <FolderQueryDndWrapper
                                                                sensors={sensors}
                                                                folderItems={folderItems}
                                                                onDragStart={handleQueryDragStart}
                                                                onDragEnd={makeQueryDragEnd(folder.id)}
                                                                activeQueryForOverlay={activeQueryForOverlay}
                                                                renderQueryItem={renderQueryItem}
                                                            />
                                                        )}
                                                    </FolderItem>
                                                )}
                                            </SortableFolderWrapper>
                                        );
                                    })}
                                </SortableContext>
                                <DragOverlay dropAnimation={null}>
                                    {activeFolderForOverlay && (
                                        <div className="flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 shadow-md">
                                            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                                            <span className="text-sm font-medium">{activeFolderForOverlay.name}</span>
                                        </div>
                                    )}
                                </DragOverlay>
                            </DndContext>
                            </div>
                            {/* Separator between folders and root queries */}
                            {folders.length > 0 && rootItems.length > 0 && (
                                <div className="border-t border-border/40 my-1.5" />
                            )}
                            {/* Root-level queries with DnD reorder */}
                            <div ref={rootQueriesContainerRef}>
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                modifiers={rootQueriesModifiers}
                                onDragStart={handleQueryDragStart}
                                onDragEnd={makeQueryDragEnd(null)}
                            >
                                <SortableContext items={rootItems.map(q => q.id)} strategy={verticalListSortingStrategy}>
                                    {rootItems.map(item => (
                                        <SortableQueryWrapper key={item.id} id={item.id}>
                                            {({ listeners, attributes }) => renderQueryItem(item, { listeners, attributes })}
                                        </SortableQueryWrapper>
                                    ))}
                                </SortableContext>
                                <DragOverlay dropAnimation={null}>
                                    {activeQueryForOverlay && (
                                        <div className="rounded-md border bg-background px-3 py-1.5 shadow-md">
                                            <div className="text-sm font-medium truncate max-w-[200px]">{activeQueryForOverlay.title}</div>
                                            <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                                                {summarizeSql(activeQueryForOverlay.sqlText ?? '')}
                                            </div>
                                        </div>
                                    )}
                                </DragOverlay>
                            </DndContext>
                            </div>
                            {loadingMore ? (
                                <div className="py-3 text-center text-xs text-muted-foreground">
                                    {t('SavedQueries.Loading')}
                                </div>
                            ) : null}
                        </div>
                    )}
                </ScrollArea>
            </div>

            {/* Rename query dialog */}
            <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('SavedQueries.RenameTitle')}</DialogTitle>
                    </DialogHeader>
                    <Input
                        value={renameValue}
                        onChange={event => setRenameValue(event.target.value)}
                        placeholder={t('SavedQueries.RenamePlaceholder')}
                        autoFocus
                        disabled={renameSaving}
                        onKeyDown={event => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                void handleRenameSubmit();
                            }
                        }}
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRenameOpen(false)} disabled={renameSaving}>
                            {t('SavedQueries.Cancel')}
                        </Button>
                        <Button onClick={handleRenameSubmit} disabled={renameSaving}>
                            {renameSaving ? t('SavedQueries.Saving') : t('SavedQueries.Save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Rename folder dialog */}
            <Dialog open={renameFolderOpen} onOpenChange={setRenameFolderOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('SavedQueries.Folders.RenameTitle')}</DialogTitle>
                    </DialogHeader>
                    <Input
                        value={renameFolderValue}
                        onChange={event => setRenameFolderValue(event.target.value)}
                        placeholder={t('SavedQueries.Folders.RenamePlaceholder')}
                        autoFocus
                        disabled={renameFolderSaving}
                        onKeyDown={event => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                void handleRenameFolderSubmit();
                            }
                        }}
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRenameFolderOpen(false)} disabled={renameFolderSaving}>
                            {t('SavedQueries.Cancel')}
                        </Button>
                        <Button onClick={handleRenameFolderSubmit} disabled={renameFolderSaving}>
                            {renameFolderSaving ? t('SavedQueries.Saving') : t('SavedQueries.Save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Create folder dialog */}
            <CreateFolderDialog
                open={createFolderOpen}
                onOpenChange={setCreateFolderOpen}
                onSubmit={handleCreateFolder}
                t={t}
            />

            {/* Move to folder dialog */}
            <MoveToFolderDialog
                open={moveDialogOpen}
                onOpenChange={setMoveDialogOpen}
                folders={folders}
                currentFolderId={moveTarget?.folderId ?? null}
                onSubmit={handleMoveToFolder}
                t={t}
            />
        </div>
    );
}
