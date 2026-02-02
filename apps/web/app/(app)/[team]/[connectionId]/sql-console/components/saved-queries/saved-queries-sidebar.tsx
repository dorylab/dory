'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MoreHorizontal, RefreshCw, Trash2 } from 'lucide-react';

import { Button } from '@/registry/new-york-v4/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
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

    const notifySavedQueriesUpdated = useCallback(() => {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(new CustomEvent('saved-queries-updated'));
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

    useEffect(() => {
        fetchList(50);
    }, [fetchList]);

    useEffect(() => {
        const handler = () => {
            setLimit(50);
            setHasMore(true);
            fetchList(50);
        };
        window.addEventListener('saved-queries-updated', handler);
        return () => {
            window.removeEventListener('saved-queries-updated', handler);
        };
    }, [fetchList]);

    const filteredItems = useMemo(() => {
        const keyword = searchValue.trim().toLowerCase();
        if (!keyword) return items;
        return items.filter(item => {
            const title = item.title?.toLowerCase() ?? '';
            const sql = item.sqlText?.toLowerCase() ?? '';
            return title.includes(keyword) || sql.includes(keyword);
        });
    }, [items, searchValue]);

    const emptyHint = useMemo(() => {
        if (loading) return t('SavedQueries.Loading');
        if (error) return error;
        if (searchValue.trim()) return t('SavedQueries.SearchEmpty');
        return t('SavedQueries.Empty');
    }, [loading, error, t, searchValue]);

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
        [t, connectionId],
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
                    onClick={() => {
                        setLimit(50);
                        setHasMore(true);
                        fetchList(50);
                    }}
                    disabled={loading}
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </div>
            <div ref={scrollRootRef} className="flex-1 min-h-0">
                <ScrollArea className="h-full pr-2">
                    {filteredItems.length === 0 ? (
                        <div className="text-xs text-muted-foreground py-6 text-center">{emptyHint}</div>
                    ) : (
                        <div className="space-y-1">
                            {filteredItems.map(item => {
                                const summary = summarizeSql(item.sqlText ?? '');
                                const displaySql = item.sqlText ?? '';
                                const isMenuOpen = menuOpenId === item.id;
                                const hoverOpen =
                                    hoverOpenId === item.id &&
                                    !isMenuOpen &&
                                    !renameOpen &&
                                    hoverBlockOnceId !== item.id;
                                return (
                                    <HoverCard
                                        key={item.id}
                                        open={hoverOpen}
                                        onOpenChange={open => {
                                            if (isMenuOpen || renameOpen) return;
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
                                                <button
                                                    type="button"
                                                    className="flex-1 min-w-0 text-left"
                                                    onClick={() => onSelect?.(item)}
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
                            })}
                            {loadingMore ? (
                                <div className="py-3 text-center text-xs text-muted-foreground">
                                    {t('SavedQueries.Loading')}
                                </div>
                            ) : null}
                        </div>
                    )}
                </ScrollArea>
            </div>
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
        </div>
    );
}
