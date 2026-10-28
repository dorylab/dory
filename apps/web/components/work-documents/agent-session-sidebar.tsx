'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AgentWorkSummary } from '@dory/shared/types/agent-work';
import { useFormatter, useTranslations } from 'next-intl';
import { MoreHorizontal, Plus, Search } from 'lucide-react';

import { apiDeleteSession, apiRenameSession } from '@/app/(app)/[organization]/[connectionId]/chatbot/core/api';
import { searchWorks } from '@/lib/work-documents/work-summary';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';

export function useAgentWorkActions(organization: string, chatId: string, onCreate: () => void) {
    const client = useQueryClient();
    const [target, setTarget] = useState<{ work: AgentWorkSummary; action: 'rename' | 'delete' } | null>(null);
    const [title, setTitle] = useState('');
    const mutation = useMutation({
        mutationFn: async () => {
            if (!target) return;
            if (target.action === 'rename') await apiRenameSession({ sessionId: target.work.id, title: title.trim() });
            else await apiDeleteSession(target.work.id);
        },
        onSuccess: async () => {
            if (target?.action === 'delete') {
                if (target.work.id === chatId) onCreate();
                client.removeQueries({ queryKey: ['agent-history', organization, target.work.id] });
            }
            setTarget(null);
            await client.invalidateQueries({ queryKey: ['data-agent', organization] });
        },
    });
    return {
        target,
        title,
        setTitle,
        mutation,
        close: () => setTarget(null),
        open: (work: AgentWorkSummary, action: 'rename' | 'delete') => {
            mutation.reset();
            setTitle(work.title ?? '');
            setTarget({ work, action });
        },
    };
}
type Actions = ReturnType<typeof useAgentWorkActions>;

export function WorkTitle({ work }: { work?: AgentWorkSummary }) {
    const t = useTranslations('WorkDocuments.Works');
    return <>{work?.title || t(!work || work.titlePending ? 'New' : 'Untitled')}</>;
}

export function WorkMetadata({ work }: { work: AgentWorkSummary }) {
    const t = useTranslations('WorkDocuments.Works');
    const format = useFormatter();
    return (
        <span>
            {[
                t(`Status.${work.status}`),
                t('Updated', { time: format.relativeTime(new Date(work.updatedAt), new Date()) }),
                ...(['report', 'chart', 'result'] as const).filter(type => work.counts[type] > 0).map(type => t(`Counts.${type}`, { count: work.counts[type] })),
            ].join(' · ')}
        </span>
    );
}

export function WorkMenu({ work, actions, disabled }: { work: AgentWorkSummary; actions: Actions; disabled: boolean }) {
    const t = useTranslations('WorkDocuments.Works');
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" disabled={disabled} aria-label={t('Actions')}>
                    <MoreHorizontal className="size-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => actions.open(work, 'rename')}>{t('Rename')}</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" disabled={work.status === 'running'} onSelect={() => actions.open(work, 'delete')}>
                    {t('Delete')}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function WorkActionDialog({ actions, disabled }: { actions: Actions; disabled: boolean }) {
    const t = useTranslations('WorkDocuments.Works');
    const deleting = actions.target?.action === 'delete';
    return (
        <Dialog
            open={Boolean(actions.target)}
            onOpenChange={open => {
                if (!open && !actions.mutation.isPending) actions.close();
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t(deleting ? 'Delete' : 'Rename')}</DialogTitle>
                    <DialogDescription>{t(deleting ? 'DeleteDescription' : 'RenameDescription')}</DialogDescription>
                </DialogHeader>
                {!deleting ? (
                    <Input
                        autoFocus
                        aria-label={t('Title')}
                        maxLength={160}
                        value={actions.title}
                        onChange={event => actions.setTitle(event.target.value)}
                        onKeyDown={event => {
                            if (event.key === 'Enter' && actions.title.trim() && !disabled && !actions.mutation.isPending) actions.mutation.mutate();
                        }}
                    />
                ) : (
                    <p className="break-words text-sm">{actions.target?.work.title}</p>
                )}
                {actions.mutation.error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {actions.mutation.error.message}
                    </p>
                ) : null}
                <DialogFooter>
                    <Button variant="outline" disabled={actions.mutation.isPending} onClick={actions.close}>
                        {t('Cancel')}
                    </Button>
                    <Button
                        variant={deleting ? 'destructive' : 'default'}
                        disabled={disabled || actions.mutation.isPending || (!deleting && !actions.title.trim())}
                        onClick={() => actions.mutation.mutate()}
                    >
                        {t(deleting ? 'Delete' : 'Save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function AgentSessionSidebar({
    works,
    loading,
    chatId,
    disabled,
    onCreate,
    onSelect,
    actions,
}: {
    works: AgentWorkSummary[];
    loading: boolean;
    chatId: string;
    disabled: boolean;
    onCreate: () => void;
    onSelect: (id: string) => void;
    actions: Actions;
}) {
    const t = useTranslations('WorkDocuments.Works');
    const [search, setSearch] = useState('');
    const [searchIndex, setSearchIndex] = useState(0);
    const [mobileOpen, setMobileOpen] = useState(false);
    const results = searchWorks(works, search);
    const content = (
        <>
            <div className="flex items-center justify-between p-3">
                <h2 className="text-sm font-semibold">{t('Heading')}</h2>
                <Button
                    size="icon"
                    variant="ghost"
                    disabled={disabled}
                    aria-label={t('New')}
                    title={t('New')}
                    onClick={() => {
                        onCreate();
                        setMobileOpen(false);
                    }}
                >
                    <Plus className="size-4" />
                </Button>
            </div>
            <div className="relative mx-3 mb-3">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                    className="pl-8"
                    placeholder={t('Search')}
                    aria-label={t('Search')}
                    value={search}
                    onChange={event => {
                        setSearch(event.target.value);
                        setSearchIndex(0);
                    }}
                    onKeyDown={event => {
                        if (disabled || !search.trim() || !results.length) return;
                        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                            event.preventDefault();
                            setSearchIndex(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
                        } else if (event.key === 'Enter') {
                            event.preventDefault();
                            onSelect(results[Math.min(searchIndex, results.length - 1)].work.id);
                            setMobileOpen(false);
                        }
                    }}
                />
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-2">
                {loading ? (
                    <p role="status" className="p-3 text-sm text-muted-foreground">
                        {t('Loading')}
                    </p>
                ) : results.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">{t(search.trim() ? 'NoMatches' : 'Empty')}</p>
                ) : null}
                {results.map(({ work, matchedOutput }, index) => (
                    <div
                        key={work.id}
                        className={`mb-1 flex items-start rounded-lg ${work.id === chatId ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'} ${search.trim() && index === searchIndex ? 'ring-1 ring-ring' : ''}`}
                    >
                        <button
                            type="button"
                            disabled={disabled}
                            aria-current={work.id === chatId ? 'page' : undefined}
                            className="min-w-0 flex-1 cursor-pointer rounded-lg p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60"
                            onClick={() => {
                                onSelect(work.id);
                                setMobileOpen(false);
                            }}
                        >
                            <span className="block truncate text-sm font-medium">
                                <WorkTitle work={work} />
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                                <WorkMetadata work={work} />
                            </span>
                            {matchedOutput ? <span className="mt-1 block truncate text-xs text-primary">{matchedOutput}</span> : null}
                        </button>
                        <WorkMenu work={work} actions={actions} disabled={disabled} />
                    </div>
                ))}
            </div>
        </>
    );
    return (
        <>
            <aside aria-label={t('Heading')} className="hidden h-full w-72 shrink-0 flex-col border-r md:flex">
                {content}
            </aside>
            <div className="border-b p-2 md:hidden">
                <Popover open={mobileOpen} onOpenChange={setMobileOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="ghost">{t('Heading')}</Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="flex max-h-[70dvh] w-[min(22rem,calc(100vw-2rem))] flex-col p-0">
                        {content}
                    </PopoverContent>
                </Popover>
            </div>
        </>
    );
}
