'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/registry/new-york-v4/ui/button';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
import { cn } from '@/registry/new-york-v4/lib/utils';
import { Input } from '@/registry/new-york-v4/ui/input';
import { ChevronDown, Loader2, MoreHorizontal, PlusIcon, RefreshCw } from 'lucide-react';
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
}: ChatSessionSidebarProps) {
    const submittedRef = useRef(false);
    const [popoverOpen, setPopoverOpen] = useState(false);
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

    const renderSessionList = (listVariant: 'sidebar' | 'compact') => {
        if (loadingSessions) {
            return (
                <div className="flex h-full items-center justify-center text-muted-foreground py-8">
                    <Loader2 className="h-5 w-5 animate-spin" />
                </div>
            );
        }

        if (sessions.length === 0) {
            return (
                <div className="p-4 text-sm text-muted-foreground">
                    {t('Sessions.Empty')}
                </div>
            );
        }

        return (
            <div className="p-2 space-y-1">
                {sessions.map(session => {
                    const isEditing = editingSessionId === session.id;
                    const isRenamePending = renameSubmittingId === session.id;
                    const isSelected = selectedSessionId === session.id;
                    return (
                        <div
                            key={session.id}
                            className={cn(
                                'group relative',
                                listVariant === 'compact' ? 'rounded-md' : undefined,
                            )}
                        >
                            {isEditing ? (
                                <div
                                    className={cn(
                                        'w-full rounded-md px-3 py-2 pr-8 text-left transition-colors bg-transparent',
                                        isSelected
                                            ? listVariant === 'compact'
                                                ? 'bg-primary/10'
                                                : 'bg-muted'
                                            : 'hover:bg-muted/60',
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
                                        className={cn(
                                            'w-full rounded-md px-3 py-2 text-left transition-colors pr-10',
                                            isSelected
                                                ? listVariant === 'compact'
                                                    ? 'bg-primary/10 text-primary'
                                                    : 'bg-muted'
                                                : listVariant === 'compact'
                                                    ? 'hover:bg-muted/70'
                                                    : 'hover:bg-muted/60',
                                        )}
                                    >
                                        <span className="truncate text-sm font-medium flex items-center gap-2">
                                            {session.title ?? t('Sessions.Untitled')}
                                        </span>
                                        {isRenamePending ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                        ) : null}
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
        );
    };

    const selectedTitle =
        sessions.find(item => item.id === selectedSessionId)?.title ??
        sessions[0]?.title ??
        t('Sessions.SelectPlaceholder');

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
                            {loadingSessions ? (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72 p-0">
                        <div className="p-2">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-muted-foreground">{t('Sessions.Title')}</span>
                                <div className="flex items-center gap-1">
                                    {onRefresh ? (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={onRefresh}
                                            className="h-7 w-7"
                                            title={t('Sessions.Refresh')}
                                        >
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
                            <ScrollArea className="max-h-72 pr-1">{renderSessionList('compact')}</ScrollArea>
                        </div>
                    </PopoverContent>
                </Popover>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onCreate}
                    disabled={creatingSession}
                    className="h-8 w-8"
                    title={t('Sessions.New')}
                >
                    {creatingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusIcon className="h-4 w-4" />}
                </Button>
            </div>
        );
    }

    return (
        <aside className="w-72 border-r flex flex-col bg-background">
            <div className="p-4 flex items-center justify-between gap-2 border-b">
                <span className="text-sm font-semibold text-muted-foreground">{t('Sessions.Title')}</span>
                <div className="flex items-center gap-1">
                    {onRefresh ? (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onRefresh}
                            className="h-8 w-8"
                            title={t('Sessions.Refresh')}
                        >
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                    ) : null}
                    <Button size="sm" onClick={onCreate} disabled={creatingSession} title={t('Sessions.New')}>
                        {creatingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusIcon className="h-4 w-4" />}
                    </Button>
                </div>
            </div>
            <ScrollArea className="flex-1">{renderSessionList('sidebar')}</ScrollArea>
        </aside>
    );
}
