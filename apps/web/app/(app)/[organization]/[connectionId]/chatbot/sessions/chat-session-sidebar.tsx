'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/registry/new-york-v4/lib/utils';
import { Button } from '@/registry/new-york-v4/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';
import { ChevronDown, Loader2, MoreHorizontal, PlusIcon, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { type ChatSessionItem } from '../core/types';

export type ChatSessionSidebarProps = {
    sessions: ChatSessionItem[];
    loadingSessions: boolean;
    creatingSession: boolean;
    selectedSessionId: string | null;
    editingSessionId: string | null;
    editingValue: string;
    renameSubmittingId: string | null;
    onCreate: () => void;
    onSelect: (sessionId: string) => void;
    onRenameStart: (sessionId: string) => void;
    onRenameChange: (value: string) => void;
    onRenameSubmit: () => void;
    onRenameCancel: () => void;
    onDelete: (sessionId: string) => void;
    onRefresh?: () => void;
    variant?: 'sidebar' | 'compact';
    emptySelectionLabel?: string;
};

export default function ChatSessionSidebar({
    sessions,
    loadingSessions,
    creatingSession,
    selectedSessionId,
    editingSessionId,
    editingValue,
    renameSubmittingId,
    onCreate,
    onSelect,
    onRenameStart,
    onRenameChange,
    onRenameSubmit,
    onRenameCancel,
    onDelete,
    onRefresh,
    variant = 'sidebar',
    emptySelectionLabel,
}: ChatSessionSidebarProps) {
    const submittedRef = useRef(false);
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeSearchIndex, setActiveSearchIndex] = useState(0);
    const t = useTranslations('Chatbot');

    useEffect(() => {
        submittedRef.current = false;
    }, [editingSessionId]);

    const submitInlineRename = () => {
        if (submittedRef.current) return;
        submittedRef.current = true;
        onRenameSubmit();
    };

    const handleSelect = (sessionId: string) => {
        onSelect(sessionId);
        if (variant === 'compact') {
            setPopoverOpen(false);
        }
    };

    const getSessionTimestamp = (session: ChatSessionItem) => {
        const raw = session.lastMessageAt ?? session.updatedAt ?? session.createdAt;
        if (!raw) return null;
        const date = new Date(raw);
        return Number.isNaN(date.getTime()) ? null : date;
    };

    const labels = {
        today: t('Sessions.Groups.Today'),
        last7Days: t('Sessions.Groups.Last7Days'),
        earlier: t('Sessions.Groups.Earlier'),
    };

    const highlightMatch = (text: string) => {
        const query = searchQuery.trim();
        if (!query) return text;

        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const matchIndex = lowerText.indexOf(lowerQuery);

        if (matchIndex === -1) return text;

        const before = text.slice(0, matchIndex);
        const match = text.slice(matchIndex, matchIndex + query.length);
        const after = text.slice(matchIndex + query.length);

        return (
            <>
                {before}
                <mark className="rounded-sm bg-primary/15 px-0.5 text-inherit">{match}</mark>
                {after}
            </>
        );
    };

    const getSessionGroupLabel = (session: ChatSessionItem) => {
        const date = getSessionTimestamp(session);
        if (!date) return labels.earlier;

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfSessionDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const diffDays = Math.floor((startOfToday.getTime() - startOfSessionDay.getTime()) / (24 * 60 * 60 * 1000));

        if (diffDays <= 0) return labels.today;
        if (diffDays < 7) return labels.last7Days;
        return labels.earlier;
    };

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filteredSessions = useMemo(() => {
        if (!normalizedQuery) {
            return sessions;
        }

        return sessions
            .map((session, index) => {
                const title = (session.title ?? t('Sessions.Untitled')).toLowerCase();
                return {
                    session,
                    index,
                    matchIndex: title.indexOf(normalizedQuery),
                };
            })
            .filter(item => item.matchIndex !== -1)
            .sort((a, b) => {
                const aStartsWith = a.matchIndex === 0;
                const bStartsWith = b.matchIndex === 0;

                if (aStartsWith !== bStartsWith) {
                    return aStartsWith ? -1 : 1;
                }

                if (a.matchIndex !== b.matchIndex) {
                    return a.matchIndex - b.matchIndex;
                }

                return a.index - b.index;
            })
            .map(item => item.session);
    }, [normalizedQuery, sessions, t]);

    const sessionGroups = useMemo(
        () =>
            filteredSessions.reduce<Array<{ label: string; items: ChatSessionItem[] }>>((groups, session) => {
                const label = getSessionGroupLabel(session);
                const lastGroup = groups.at(-1);
                if (!lastGroup || lastGroup.label !== label) {
                    groups.push({ label, items: [session] });
                } else {
                    lastGroup.items.push(session);
                }
                return groups;
            }, []),
        [filteredSessions],
    );

    useEffect(() => {
        setActiveSearchIndex(0);
    }, [normalizedQuery]);

    useEffect(() => {
        if (filteredSessions.length === 0) {
            setActiveSearchIndex(0);
            return;
        }

        setActiveSearchIndex(current => Math.min(current, filteredSessions.length - 1));
    }, [filteredSessions]);

    const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (!normalizedQuery || filteredSessions.length === 0) {
            return;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveSearchIndex(current => (current + 1) % filteredSessions.length);
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveSearchIndex(current => (current - 1 + filteredSessions.length) % filteredSessions.length);
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            const activeSession = filteredSessions[activeSearchIndex];
            if (activeSession) {
                handleSelect(activeSession.id);
            }
        }
    };

    const renderSessionList = (listVariant: 'sidebar' | 'compact') => {
        if (loadingSessions) {
            return (
                <div className="flex h-full items-center justify-center text-muted-foreground py-8">
                    <Loader2 className="h-5 w-5 animate-spin" />
                </div>
            );
        }

        if (sessions.length === 0) {
            return <div className="p-4 text-sm text-muted-foreground">{t('Sessions.Empty')}</div>;
        }

        if (filteredSessions.length === 0) {
            return <div className="p-4 text-sm text-muted-foreground">{t('Sessions.NoMatches')}</div>;
        }

        return (
            <div className="space-y-3 p-2">
                {sessionGroups.map(group => (
                    <div key={group.label} className="space-y-1">
                        <div className="px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{group.label}</div>
                        {group.items.map(session => {
                            const isEditing = editingSessionId === session.id;
                            const isRenamePending = renameSubmittingId === session.id;
                            const isSelected = selectedSessionId === session.id;
                            const isSearchActive = normalizedQuery.length > 0 && filteredSessions[activeSearchIndex]?.id === session.id;
                            return (
                                <div key={session.id} className={cn('group relative', listVariant === 'compact' ? 'rounded-md' : undefined)}>
                                    {isEditing ? (
                                        <div
                                            className={cn(
                                                'w-full rounded-md px-3 py-2 pr-8 text-left transition-colors bg-transparent',
                                                isSelected ? (listVariant === 'compact' ? 'bg-primary/10' : 'bg-muted') : 'hover:bg-muted/60',
                                            )}
                                        >
                                            <Input
                                                value={editingValue}
                                                onChange={event => onRenameChange(event.target.value)}
                                                autoFocus
                                                placeholder={t('Sessions.RenamePlaceholder')}
                                                className="h-7 text-sm border-none bg-transparent px-0 py-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                                onKeyDown={event => {
                                                    if (event.key === 'Enter') {
                                                        event.preventDefault();
                                                        onRenameChange(editingValue.trim());
                                                        submitInlineRename();
                                                    } else if (event.key === 'Escape') {
                                                        submittedRef.current = true;
                                                        event.preventDefault();
                                                        onRenameCancel();
                                                    }
                                                }}
                                                onBlur={() => {
                                                    onRenameChange(editingValue.trim());
                                                    submitInlineRename();
                                                }}
                                            />
                                        </div>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => handleSelect(session.id)}
                                                title={session.title ?? t('Sessions.Untitled')}
                                                className={cn(
                                                    'w-full rounded-md px-3 py-2 text-left transition-colors pr-10',
                                                    isSearchActive && !isSelected
                                                        ? 'bg-accent text-accent-foreground'
                                                        : isSelected
                                                          ? listVariant === 'compact'
                                                              ? 'bg-primary/10 text-primary'
                                                              : 'bg-muted'
                                                          : listVariant === 'compact'
                                                            ? 'hover:bg-muted/70'
                                                            : 'hover:bg-muted/60',
                                                )}
                                            >
                                                {(() => {
                                                    const sessionTitle = session.title ?? t('Sessions.Untitled');
                                                    return (
                                                        <span className="flex min-w-0 items-center gap-2">
                                                            <span className="truncate text-sm font-medium">{highlightMatch(sessionTitle)}</span>
                                                            {isRenamePending ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" /> : null}
                                                        </span>
                                                    );
                                                })()}
                                            </button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={event => event.stopPropagation()}
                                                        className={cn(
                                                            'absolute right-1.5 top-1.5 h-6 w-6 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto',
                                                            listVariant === 'compact' ? 'bg-background/80 backdrop-blur' : undefined,
                                                        )}
                                                    >
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent side="right" align="start">
                                                    <DropdownMenuItem onSelect={() => onRenameStart(session.id)}>
                                                        <span>{t('Sessions.Rename')}</span>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={() => onDelete(session.id)}>
                                                        <span>{t('Sessions.Delete')}</span>
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        );
    };

    const selectedTitle = sessions.find(item => item.id === selectedSessionId)?.title ?? emptySelectionLabel ?? sessions[0]?.title ?? t('Sessions.SelectPlaceholder');

    if (variant === 'compact') {
        return (
            <div className="flex items-center gap-2">
                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            className="max-w-[260px] justify-between gap-2 rounded-lg border-muted-foreground/20 bg-background/80 text-sm font-medium shadow-sm"
                        >
                            <span className="truncate">{selectedTitle}</span>
                            {loadingSessions ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72 p-0">
                        <div className="p-2">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-muted-foreground">{t('Sessions.Title')}</span>
                                <div className="flex items-center gap-1">
                                    {onRefresh ? (
                                        <Button variant="ghost" size="icon" onClick={onRefresh} className="h-7 w-7" title={t('Sessions.Refresh')}>
                                            <RefreshCw className="h-4 w-4" />
                                        </Button>
                                    ) : null}
                                    <Button
                                        size="icon"
                                        onClick={() => {
                                            setPopoverOpen(false);
                                            onCreate();
                                        }}
                                        disabled={creatingSession}
                                        className="h-7 w-7"
                                        title={t('Sessions.New')}
                                    >
                                        {creatingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusIcon className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>
                            <Input
                                value={searchQuery}
                                onChange={event => setSearchQuery(event.target.value)}
                                onKeyDown={handleSearchKeyDown}
                                placeholder={t('Sessions.SearchPlaceholder')}
                                className="mb-2 h-8"
                            />
                            <ScrollArea className="max-h-72 pr-1">{renderSessionList('compact')}</ScrollArea>
                        </div>
                    </PopoverContent>
                </Popover>
                <Button variant="ghost" size="icon" onClick={onCreate} disabled={creatingSession} className="h-8 w-8" title={t('Sessions.New')}>
                    {creatingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusIcon className="h-4 w-4" />}
                </Button>
            </div>
        );
    }

    return (
        <aside className="flex h-full min-h-0 w-72 flex-col overflow-hidden border-r bg-background">
            <div className="p-4 flex items-center justify-between gap-2 border-b">
                <span className="text-sm font-semibold text-muted-foreground">{t('Sessions.Title')}</span>
                <div className="flex items-center gap-1">
                    {onRefresh ? (
                        <Button variant="ghost" size="icon" onClick={onRefresh} className="h-8 w-8" title={t('Sessions.Refresh')}>
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                    ) : null}
                    <Button size="sm" onClick={onCreate} disabled={creatingSession} title={t('Sessions.New')}>
                        {creatingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusIcon className="h-4 w-4" />}
                    </Button>
                </div>
            </div>
            <div className="border-b p-3">
                <Input
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder={t('Sessions.SearchPlaceholder')}
                    className="h-8"
                />
            </div>
            <ScrollArea className="min-h-0 flex-1">{renderSessionList('sidebar')}</ScrollArea>
        </aside>
    );
}
