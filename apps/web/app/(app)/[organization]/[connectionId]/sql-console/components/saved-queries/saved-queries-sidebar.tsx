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
    type CollisionDetection,
    type DragEndEvent,
    type DragOverEvent,
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/registry/new-york-v4/ui/hover-card';
import { Input } from '@/registry/new-york-v4/ui/input';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import { SmartCodeBlock } from '@/components/@dory/ui/code-block/code-block';
import { authFetch } from '@/lib/client/auth-fetch';
import { authClient } from '@/lib/auth-client';
import { isAnonymousUser } from '@/lib/auth/anonymous-user';
import { cn } from '@dory/web-utils';
import { useAtomValue } from 'jotai';
import { useLocale, useTranslations } from 'next-intl';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import posthog from 'posthog-js';
import { AccountRequiredSheet } from '@/components/auth/account-required-sheet';
import { FolderItem, type FolderData } from './folder-item';
import { CreateFolderDialog } from './create-folder-dialog';
import { DeleteConfirmationDialog } from './delete-confirmation-dialog';
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

const FOLDER_DND_PREFIX = 'folder:';
const QUERY_DND_PREFIX = 'query:';

function getFolderDndId(folderId: string) {
    return `${FOLDER_DND_PREFIX}${folderId}`;
}

function getQueryDndId(queryId: string) {
    return `${QUERY_DND_PREFIX}${queryId}`;
}

function parseDndId(value: string | number) {
    const id = String(value);
    if (id.startsWith(FOLDER_DND_PREFIX)) {
        return { type: 'folder' as const, id: id.slice(FOLDER_DND_PREFIX.length) };
    }
    if (id.startsWith(QUERY_DND_PREFIX)) {
        return { type: 'query' as const, id: id.slice(QUERY_DND_PREFIX.length) };
    }
    return null;
}

// ---------------------------------------------------------------------------
// Sortable wrappers
// ---------------------------------------------------------------------------
function createRestrictToContainer(containerRef: React.RefObject<HTMLDivElement | null>): Modifier {
    return ({ transform, draggingNodeRect }) => {
        const container = containerRef.current;
        if (!container || !draggingNodeRect) return transform;
        const containerRect = container.getBoundingClientRect();
        const clampedY = Math.min(Math.max(transform.y, containerRect.top - draggingNodeRect.top), containerRect.bottom - draggingNodeRect.bottom);
        return { ...transform, y: clampedY };
    };
}

function SortableFolderWrapper({
    id,
    children,
}: {
    id: string;
    children: (props: { listeners: Record<string, Function>; attributes: Record<string, any>; isDragging: boolean }) => React.ReactNode;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: getFolderDndId(id),
        data: {
            type: 'folder',
            folderId: id,
        },
    });
    const style = { transform: CSS.Transform.toString(transform), transition };
    return (
        <div ref={setNodeRef} style={style}>
            {children({ listeners: listeners ?? {}, attributes, isDragging })}
        </div>
    );
}

function SortableQueryWrapper({
    id,
    folderId,
    children,
}: {
    id: string;
    folderId: string | null;
    children: (props: { listeners: Record<string, Function>; attributes: Record<string, any>; isDragging: boolean }) => React.ReactNode;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: getQueryDndId(id),
        data: {
            type: 'query',
            queryId: id,
            folderId,
        },
    });
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
    } catch {
        /* ignore */
    }
    return new Set();
}

function saveExpandedFolders(set: Set<string>) {
    try {
        localStorage.setItem(EXPANDED_FOLDERS_KEY, JSON.stringify([...set]));
    } catch {
        /* ignore */
    }
}

export function SavedQueriesSidebar({ onSelect }: SavedQueriesSidebarProps) {
    const t = useTranslations('SqlConsole');
    const locale = useLocale();
    const { data: session } = authClient.useSession();
    const currentConnection = useAtomValue(currentConnectionAtom);
    const connectionId = currentConnection?.connection.id ?? null;
    const isAnonymous = isAnonymousUser(session?.user);
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
    const [deleteQueryTarget, setDeleteQueryTarget] = useState<SavedQueryItem | null>(null);
    const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderData | null>(null);
    const [deleteSaving, setDeleteSaving] = useState(false);
    const [moveTarget, setMoveTarget] = useState<SavedQueryItem | null>(null);
    const [moveDialogOpen, setMoveDialogOpen] = useState(false);
    const [activeDropFolderId, setActiveDropFolderId] = useState<string | null>(null);
    const [absorbingFolderId, setAbsorbingFolderId] = useState<string | null>(null);
    const absorbTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        if (isAnonymous) {
            setFolders([]);
            return;
        }
        try {
            const res = await authFetch('/api/sql-console/saved-query-folders');
            const data = await res.json().catch(() => null);
            if (res.ok && data?.code === 0) {
                setFolders(data.data ?? []);
            }
        } catch {
            /* ignore */
        }
    }, [isAnonymous]);

    const fetchList = useCallback(
        async (nextLimit: number, options?: { silent?: boolean }) => {
            if (!options?.silent) setLoading(true);
            setError(null);
            if (isAnonymous) {
                setItems([]);
                setHasMore(false);
                if (!options?.silent) setLoading(false);
                return;
            }
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
        },
        [t, connectionId, isAnonymous],
    );

    const fetchAll = useCallback(
        (nextLimit?: number) => {
            fetchFolders();
            fetchList(nextLimit ?? 50);
        },
        [fetchFolders, fetchList],
    );

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

    useEffect(() => {
        return () => {
            if (absorbTimeoutRef.current) {
                clearTimeout(absorbTimeoutRef.current);
            }
        };
    }, []);

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

    const deleteSavedQuery = async (item: SavedQueryItem) => {
        if (!connectionId) {
            const message = t('Api.SqlConsole.Tabs.MissingConnectionContext');
            setError(message);
            return false;
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
            return true;
        } catch (err) {
            const message = err instanceof Error ? err.message : t('SavedQueries.LoadFailed');
            setError(message);
            return false;
        }
    };

    const openDeleteQuery = (item: SavedQueryItem) => {
        setDeleteQueryTarget(item);
        setDeleteFolderTarget(null);
        setMenuOpenId(null);
        setHoverOpenId(null);
        setHoverBlockOnceId(null);
    };

    const handleDeleteQueryConfirm = async () => {
        if (!deleteQueryTarget || deleteSaving) return;
        setDeleteSaving(true);
        try {
            const deleted = await deleteSavedQuery(deleteQueryTarget);
            if (deleted) {
                setDeleteQueryTarget(null);
            }
        } finally {
            setDeleteSaving(false);
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

    const deleteFolder = async (folder: FolderData) => {
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
            return true;
        } catch (err) {
            const message = err instanceof Error ? err.message : t('SavedQueries.LoadFailed');
            setError(message);
            return false;
        }
    };

    const openDeleteFolder = (folder: FolderData) => {
        setDeleteFolderTarget(folder);
        setDeleteQueryTarget(null);
    };

    const handleDeleteFolderConfirm = async () => {
        if (!deleteFolderTarget || deleteSaving) return;
        setDeleteSaving(true);
        try {
            const deleted = await deleteFolder(deleteFolderTarget);
            if (deleted) {
                setDeleteFolderTarget(null);
            }
        } finally {
            setDeleteSaving(false);
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
    // DnD
    // -----------------------------------------------------------------------
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
    const dndContainerRef = useRef<HTMLDivElement | null>(null);
    const dndModifiers = useMemo(() => [restrictToVerticalAxis, createRestrictToContainer(dndContainerRef)], []);
    const [activeFolderDragId, setActiveFolderDragId] = useState<string | null>(null);
    const folderIds = useMemo(() => folders.map(f => getFolderDndId(f.id)), [folders]);
    const getScopeItems = useCallback((folderId: string | null) => (folderId ? (folderQueryMap.get(folderId) ?? []) : rootItems), [folderQueryMap, rootItems]);
    const collisionDetection = useCallback<CollisionDetection>(args => {
        const active = parseDndId(args.active.id);
        if (!active) return closestCenter(args);
        const filtered = args.droppableContainers.filter(container => {
            const target = parseDndId(container.id);
            if (!target) return false;
            if (active.type === 'folder') return target.type === 'folder';
            return target.type === 'folder' || target.type === 'query';
        });
        return closestCenter({
            ...args,
            droppableContainers: filtered,
        });
    }, []);

    const applyQueryOrder = useCallback((orderedIds: string[], destinationFolderId: string | null) => {
        setItems(prev => {
            const itemMap = new Map(prev.map(item => [item.id, item]));
            const movingIds = new Set(orderedIds);
            const remaining = prev.filter(item => !movingIds.has(item.id));
            const orderedItems: SavedQueryItem[] = [];
            for (const id of orderedIds) {
                const item = itemMap.get(id);
                if (!item) continue;
                orderedItems.push({ ...item, folderId: destinationFolderId });
            }
            return [...remaining, ...orderedItems];
        });
    }, []);

    const persistQueryMove = useCallback(
        async (params: { activeQuery: SavedQueryItem; destinationFolderId: string | null; orderedIds: string[] }) => {
            const { activeQuery, destinationFolderId, orderedIds } = params;
            const currentFolderId = activeQuery.folderId ?? null;
            const destinationItems = getScopeItems(destinationFolderId).filter(item => item.id !== activeQuery.id);

            if (currentFolderId !== destinationFolderId) {
                const nextPosition = destinationItems.reduce((max, item) => Math.max(max, item.position ?? 0), 0) + 1000;
                const patchRes = await authFetch(`/api/sql-console/saved-queries?id=${activeQuery.id}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(connectionId ? { 'X-Connection-ID': connectionId } : {}),
                    },
                    body: JSON.stringify({
                        folderId: destinationFolderId,
                        position: nextPosition,
                    }),
                });
                const patchData = await patchRes.json().catch(() => null);
                if (!patchRes.ok || (patchData && patchData.code !== 0)) {
                    throw new Error(patchData?.message ?? t('SavedQueries.LoadFailed'));
                }
            }

            const reorderRes = await authFetch('/api/sql-console/saved-queries/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderId: destinationFolderId, orderedIds }),
            });
            const reorderData = await reorderRes.json().catch(() => null);
            if (!reorderRes.ok || (reorderData && reorderData.code !== 0)) {
                throw new Error(reorderData?.message ?? t('SavedQueries.LoadFailed'));
            }
        },
        [connectionId, getScopeItems, t],
    );

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const active = parseDndId(event.active.id);
        if (!active) return;
        if (active.type === 'folder') {
            setActiveFolderDragId(active.id);
        } else {
            setActiveQueryDragId(active.id);
        }
        setActiveDropFolderId(null);
        setHoverOpenId(null);
    }, []);

    const handleDragOver = useCallback(
        (event: DragOverEvent) => {
            const activeMeta = parseDndId(event.active.id);
            const overMeta = event.over ? parseDndId(event.over.id) : null;

            if (!activeMeta || activeMeta.type !== 'query') {
                setActiveDropFolderId(null);
                return;
            }

            const activeQuery = items.find(item => item.id === activeMeta.id);
            if (!activeQuery || !overMeta) {
                setActiveDropFolderId(null);
                return;
            }

            if (overMeta.type === 'folder') {
                setActiveDropFolderId(overMeta.id !== (activeQuery.folderId ?? null) ? overMeta.id : null);
                return;
            }

            const overQuery = items.find(item => item.id === overMeta.id);
            const destinationFolderId = overQuery?.folderId ?? null;
            setActiveDropFolderId(destinationFolderId && destinationFolderId !== (activeQuery.folderId ?? null) ? destinationFolderId : null);
        },
        [items],
    );

    const handleDragEnd = useCallback(
        async (event: DragEndEvent) => {
            const { active, over } = event;
            const activeMeta = parseDndId(active.id);
            const overMeta = over ? parseDndId(over.id) : null;

            setActiveFolderDragId(null);
            setActiveQueryDragId(null);
            setActiveDropFolderId(null);

            if (!activeMeta || !overMeta || !over || active.id === over.id) return;

            if (activeMeta.type === 'folder') {
                if (overMeta.type !== 'folder') return;
                const oldIndex = folders.findIndex(f => f.id === activeMeta.id);
                const newIndex = folders.findIndex(f => f.id === overMeta.id);
                if (oldIndex < 0 || newIndex < 0) return;
                const reordered = arrayMove(folders, oldIndex, newIndex);
                setFolders(reordered);
                try {
                    await authFetch('/api/sql-console/saved-query-folders/reorder', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ orderedIds: reordered.map(f => f.id) }),
                    });
                } catch {
                    /* optimistic update */
                }
                return;
            }

            const activeQuery = items.find(item => item.id === activeMeta.id);
            if (!activeQuery) return;

            const currentFolderId = activeQuery.folderId ?? null;
            let destinationFolderId: string | null = currentFolderId;
            let orderedIds: string[] = [];

            if (overMeta.type === 'folder') {
                destinationFolderId = overMeta.id;
                const destinationItems = getScopeItems(destinationFolderId).filter(item => item.id !== activeQuery.id);
                orderedIds = [...destinationItems.map(item => item.id), activeQuery.id];
            } else {
                const overQuery = items.find(item => item.id === overMeta.id);
                if (!overQuery) return;
                destinationFolderId = overQuery.folderId ?? null;
                const destinationItems = getScopeItems(destinationFolderId).filter(item => item.id !== activeQuery.id);
                const insertIndex = destinationItems.findIndex(item => item.id === overQuery.id);
                if (insertIndex < 0) return;
                orderedIds = [...destinationItems.slice(0, insertIndex).map(item => item.id), activeQuery.id, ...destinationItems.slice(insertIndex).map(item => item.id)];
            }

            if (!orderedIds.length) return;

            applyQueryOrder(orderedIds, destinationFolderId);

            try {
                await persistQueryMove({
                    activeQuery,
                    destinationFolderId,
                    orderedIds,
                });
                if (destinationFolderId && destinationFolderId !== currentFolderId) {
                    if (absorbTimeoutRef.current) {
                        clearTimeout(absorbTimeoutRef.current);
                    }
                    setAbsorbingFolderId(destinationFolderId);
                    absorbTimeoutRef.current = setTimeout(() => {
                        setAbsorbingFolderId(current => (current === destinationFolderId ? null : current));
                    }, 260);
                }
                notifySavedQueriesUpdated();
                void fetchList(limit, { silent: true });
            } catch (err) {
                const message = err instanceof Error ? err.message : t('SavedQueries.LoadFailed');
                setError(message);
                void fetchList(limit, { silent: true });
            }
        },
        [applyQueryOrder, fetchList, folders, getScopeItems, items, limit, notifySavedQueriesUpdated, persistQueryMove, t],
    );

    const handleDragCancel = useCallback(() => {
        setActiveFolderDragId(null);
        setActiveQueryDragId(null);
        setActiveDropFolderId(null);
    }, []);

    const activeFolderForOverlay = useMemo(() => (activeFolderDragId ? folders.find(f => f.id === activeFolderDragId) : null), [activeFolderDragId, folders]);
    const [activeQueryDragId, setActiveQueryDragId] = useState<string | null>(null);
    const activeQueryForOverlay = useMemo(() => (activeQueryDragId ? items.find(q => q.id === activeQueryDragId) : null), [activeQueryDragId, items]);

    const hasContent = !isSearching ? folders.length > 0 || rootItems.length > 0 : rootItems.length > 0;

    if (isAnonymous) {
        return <AccountRequiredSheet compact title={t('SavedQueries.AccountRequiredTitle')} />;
    }

    const renderQueryItem = (item: SavedQueryItem, dragProps?: { listeners: Record<string, Function>; attributes: Record<string, any> }) => {
        const summary = summarizeSql(item.sqlText ?? '');
        const displaySql = item.sqlText ?? '';
        const isMenuOpen = menuOpenId === item.id;
        const hoverOpen = hoverOpenId === item.id && !isMenuOpen && !renameOpen && !renameFolderOpen && hoverBlockOnceId !== item.id;
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
                            'group flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors',
                            'border border-transparent hover:border-muted-foreground/20 hover:bg-muted/40',
                        )}
                    >
                        {dragProps && (
                            <button
                                type="button"
                                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center cursor-grab opacity-30 touch-none group-hover:opacity-60 hover:!opacity-100 active:cursor-grabbing"
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
                            <div className="text-[11px] text-muted-foreground truncate max-w-full">{summary || '—'}</div>
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
                                        'mt-px h-6 w-6 shrink-0 rounded-sm p-0 transition-opacity',
                                        menuOpenId === item.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 hover:opacity-100 focus-visible:opacity-100',
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
                                <DropdownMenuItem onClick={() => openRename(item)}>{t('SavedQueries.Rename')}</DropdownMenuItem>
                                {folders.length > 0 && (
                                    <DropdownMenuSub>
                                        <DropdownMenuSubTrigger>{t('SavedQueries.Folders.MoveToFolder')}</DropdownMenuSubTrigger>
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
                                        openDeleteQuery(item);
                                    }}
                                    className="text-destructive focus:text-destructive"
                                >
                                    {t('SavedQueries.Delete')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </HoverCardTrigger>
                <HoverCardContent side="right" align="start" sideOffset={12} className="w-[420px] p-0 z-40">
                    <div className="space-y-4 p-4">
                        <div className="space-y-1">
                            <div className="text-lg font-semibold text-foreground">{item.title}</div>
                            <div className="text-xs text-muted-foreground">{formatTime(item.updatedAt || item.createdAt, locale)}</div>
                        </div>
                        <SmartCodeBlock value={displaySql || ' '} type="sql" maxHeightClassName="max-h-64" />
                    </div>
                </HoverCardContent>
            </HoverCard>
        );
    };

    return (
        <div className="flex h-full flex-col min-h-0 gap-2 px-2 pb-3 pt-1">
            <div className="flex items-center gap-1.5 px-1">
                <Input
                    value={searchValue}
                    onChange={event => setSearchValue(event.target.value)}
                    placeholder={t('SavedQueries.SearchPlaceholder')}
                    className="h-8 min-w-0 flex-1"
                />
                <div className="flex shrink-0 items-center gap-0.5">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCreateFolderOpen(true)} aria-label={t('SavedQueries.Folders.CreateFolder')}>
                                <FolderPlus className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">{t('SavedQueries.Folders.CreateFolder')}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                    setLimit(50);
                                    setHasMore(true);
                                    fetchAll();
                                }}
                                disabled={loading}
                                aria-label={t('Refresh')}
                            >
                                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">{t('Refresh')}</TooltipContent>
                    </Tooltip>
                </div>
            </div>
            <div ref={scrollRootRef} className="flex-1 min-h-0">
                <ScrollArea className="h-full pr-2">
                    {!hasContent ? (
                        <div className="text-xs text-muted-foreground py-6 text-center">{emptyHint}</div>
                    ) : isSearching ? (
                        <div className="space-y-1">{rootItems.map(item => renderQueryItem(item))}</div>
                    ) : (
                        <div ref={dndContainerRef}>
                            <DndContext
                                sensors={sensors}
                                collisionDetection={collisionDetection}
                                modifiers={dndModifiers}
                                onDragStart={handleDragStart}
                                onDragOver={handleDragOver}
                                onDragEnd={handleDragEnd}
                                onDragCancel={handleDragCancel}
                            >
                                <div className="space-y-1">
                                    {/* Folders with DnD reorder */}
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
                                                            isDropTarget={activeDropFolderId === folder.id}
                                                            isAbsorbing={absorbingFolderId === folder.id}
                                                            onToggle={() => toggleFolder(folder.id)}
                                                            onRename={openRenameFolder}
                                                            onDelete={openDeleteFolder}
                                                            t={t}
                                                            dragHandleListeners={listeners}
                                                            dragHandleAttributes={attributes}
                                                            isDragging={isDragging}
                                                        >
                                                            {folderItems.length === 0 ? (
                                                                <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
                                                                    <span aria-hidden className="h-4 w-4 shrink-0" />
                                                                    <span>{t('SavedQueries.Folders.EmptyFolder')}</span>
                                                                </div>
                                                            ) : (
                                                                <SortableContext items={folderItems.map(item => getQueryDndId(item.id))} strategy={verticalListSortingStrategy}>
                                                                    {folderItems.map(item => (
                                                                        <SortableQueryWrapper key={item.id} id={item.id} folderId={folder.id}>
                                                                            {({ listeners, attributes }) => renderQueryItem(item, { listeners, attributes })}
                                                                        </SortableQueryWrapper>
                                                                    ))}
                                                                </SortableContext>
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
                                    {/* Separator between folders and root queries */}
                                    {folders.length > 0 && rootItems.length > 0 && <div className="border-t border-border/40 my-1.5" />}
                                    {/* Root-level queries with DnD reorder */}
                                    <SortableContext items={rootItems.map(item => getQueryDndId(item.id))} strategy={verticalListSortingStrategy}>
                                        {rootItems.map(item => (
                                            <SortableQueryWrapper key={item.id} id={item.id} folderId={null}>
                                                {({ listeners, attributes }) => renderQueryItem(item, { listeners, attributes })}
                                            </SortableQueryWrapper>
                                        ))}
                                    </SortableContext>
                                    {loadingMore ? <div className="py-3 text-center text-xs text-muted-foreground">{t('SavedQueries.Loading')}</div> : null}
                                </div>
                                <DragOverlay dropAnimation={null}>
                                    {activeQueryForOverlay && (
                                        <div
                                            className={cn(
                                                'rounded-md border bg-background px-3 py-1.5 shadow-md',
                                                'transition-[transform,opacity,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none motion-reduce:transition-none',
                                                activeDropFolderId && 'scale-[0.9] opacity-90 shadow-[0_8px_18px_-14px_hsl(var(--foreground)/0.45)]',
                                            )}
                                        >
                                            <div className="text-sm font-medium truncate max-w-[200px]">{activeQueryForOverlay.title}</div>
                                            <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">{summarizeSql(activeQueryForOverlay.sqlText ?? '')}</div>
                                        </div>
                                    )}
                                </DragOverlay>
                            </DndContext>
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
            <CreateFolderDialog open={createFolderOpen} onOpenChange={setCreateFolderOpen} onSubmit={handleCreateFolder} t={t} />

            <DeleteConfirmationDialog
                open={Boolean(deleteQueryTarget)}
                onOpenChange={open => {
                    if (!open) {
                        setDeleteQueryTarget(null);
                    }
                }}
                title={t('SavedQueries.DeleteTitle')}
                description={t('SavedQueries.DeleteDescription', {
                    name: deleteQueryTarget?.title ?? '',
                })}
                confirmLabel={t('SavedQueries.Delete')}
                cancelLabel={t('SavedQueries.Cancel')}
                loadingLabel={t('SavedQueries.Deleting')}
                loading={deleteSaving && Boolean(deleteQueryTarget)}
                onConfirm={handleDeleteQueryConfirm}
            />

            <DeleteConfirmationDialog
                open={Boolean(deleteFolderTarget)}
                onOpenChange={open => {
                    if (!open) {
                        setDeleteFolderTarget(null);
                    }
                }}
                title={t('SavedQueries.Folders.DeleteFolderTitle')}
                description={t('SavedQueries.Folders.DeleteFolderDescription', {
                    name: deleteFolderTarget?.name ?? '',
                })}
                confirmLabel={t('SavedQueries.Folders.DeleteFolder')}
                cancelLabel={t('SavedQueries.Cancel')}
                loadingLabel={t('SavedQueries.Deleting')}
                loading={deleteSaving && Boolean(deleteFolderTarget)}
                onConfirm={handleDeleteFolderConfirm}
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
