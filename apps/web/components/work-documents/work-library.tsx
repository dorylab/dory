'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useQueryStates } from 'nuqs';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import type { WorkDocumentSummary } from '@dory/shared/types/work-document';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import { workRequest } from '@/lib/work-documents/client';
import { reportListParsers, serializeReportList } from '@/lib/work-documents/list-state';

type Reports = { documents: WorkDocumentSummary[] };
const ALL_SOURCES = '__all_sources__';

export function WorkLibrary() {
    const t = useTranslations('WorkDocuments');
    const locale = useLocale();
    const router = useRouter();
    const { organization } = useParams<{ organization: string }>();
    const [state, setState] = useQueryStates(reportListParsers);
    const archiveState = state.archiveState ?? (state.archived ? 'all' : 'active');
    const filters = { q: state.q, connectionId: state.connectionId, archiveState };
    const [renaming, setRenaming] = useState<{ id: string; title: string; revision: number } | null>(null);
    const client = useQueryClient();
    const renameInput = useRef<HTMLInputElement>(null);
    const query = useQuery({
        queryKey: ['work-documents', organization, filters],
        queryFn: ({ signal }) => workRequest<Reports>(serializeReportList('/api/work-documents', filters), undefined, signal),
    });
    const hasSearch = Boolean(state.q || state.connectionId);
    // Only check the full library when an empty active view could be mistaken for a first visit.
    const checkEmptyLibrary = query.isSuccess && !query.data.documents.length && !hasSearch && archiveState === 'active';
    const library = useQuery({
        queryKey: ['work-documents', organization, { q: '', connectionId: '', archiveState: 'all' }],
        queryFn: ({ signal }) => workRequest<Reports>('/api/work-documents?archiveState=all', undefined, signal),
        enabled: checkEmptyLibrary,
    });
    const firstReport = !hasSearch && (archiveState === 'all' || (checkEmptyLibrary && library.isSuccess && !library.data.documents.length));
    const sources = useQuery({ queryKey: ['data-agent', organization], queryFn: () => workRequest<{ connections: Array<{ id: string; name: string }> }>('/api/data-agent') });
    const refresh = async (documentId: string) => {
        await Promise.all([
            client.invalidateQueries({ queryKey: ['work-documents', organization] }),
            client.invalidateQueries({ queryKey: ['work-document', organization, documentId] }),
            client.invalidateQueries({ queryKey: ['data-agent', organization] }),
        ]);
    };
    const archive = useMutation({
        mutationFn: (document: WorkDocumentSummary) => workRequest(`/api/work-documents/${document.id}`, { action: 'archive', archived: !document.archivedAt }),
        onSuccess: async (_, document) => {
            toast.success(t(document.archivedAt ? 'Library.Restored' : 'Library.Archived'));
            await refresh(document.id);
        },
        onError: error => toast.error(error.message),
    });
    const rename = useMutation({
        mutationFn: (document: NonNullable<typeof renaming>) =>
            workRequest(`/api/work-documents/${document.id}`, { action: 'rename', title: document.title.trim(), expectedRevision: document.revision }),
        onSuccess: async (_, document) => {
            setRenaming(null);
            await refresh(document.id);
        },
        onError: error => toast.error(error.message),
    });
    const changeArchiveState = (value: typeof archiveState) => {
        setRenaming(null);
        void setState({ archiveState: value, archived: null });
    };
    return (
        <div className="mx-auto w-full max-w-6xl space-y-6 p-4 text-foreground sm:p-6">
            <header>
                <h1 className="text-2xl font-semibold">{t('Reports')}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t('LibraryDescription')}</p>
            </header>
            <div className="flex flex-wrap items-center gap-3">
                <Input
                    className="min-w-0 sm:max-w-sm"
                    aria-label={t('Search')}
                    value={state.q}
                    onChange={event => {
                        setRenaming(null);
                        void setState({ q: event.target.value });
                    }}
                    placeholder={t('Search')}
                />
                <Select
                    value={state.connectionId || ALL_SOURCES}
                    onValueChange={value => {
                        setRenaming(null);
                        void setState({ connectionId: value === ALL_SOURCES ? null : value });
                    }}
                >
                    <SelectTrigger className="max-w-full" aria-label={t('Scope')}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL_SOURCES}>{t('AllSources')}</SelectItem>
                        {state.connectionId && !sources.data?.connections.some(source => source.id === state.connectionId) ? (
                            <SelectItem value={state.connectionId}>{t('Library.UnavailableSource')}</SelectItem>
                        ) : null}
                        {sources.data?.connections.map(source => (
                            <SelectItem key={source.id} value={source.id}>
                                {source.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={archiveState} onValueChange={value => changeArchiveState(value as typeof archiveState)}>
                    <SelectTrigger aria-label={t('Library.Filter')}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="active">{t('Library.Active')}</SelectItem>
                        <SelectItem value="archived">{t('Archived')}</SelectItem>
                        <SelectItem value="all">{t('Library.All')}</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            {query.isError ? (
                <div role="alert" className="space-y-2 rounded-lg border p-6">
                    <p className="text-sm text-destructive">{query.error.message}</p>
                    <Button variant="outline" onClick={() => void query.refetch()}>
                        {t('Library.Retry')}
                    </Button>
                </div>
            ) : query.isPending || (checkEmptyLibrary && library.isPending) ? (
                <p role="status" className="p-6 text-sm text-muted-foreground">
                    {t('Loading')}
                </p>
            ) : query.data.documents.length === 0 ? (
                <div className="space-y-3 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    {checkEmptyLibrary && library.isError ? (
                        <div role="alert">
                            <p>{library.error.message}</p>
                            <Button variant="outline" onClick={() => void library.refetch()}>
                                {t('Library.Retry')}
                            </Button>
                        </div>
                    ) : (
                        <>
                            <p>{t(hasSearch ? 'Library.NoMatches' : archiveState === 'archived' ? 'Library.EmptyArchived' : firstReport ? 'Empty' : 'Library.EmptyActive')}</p>
                            {hasSearch ? (
                                <Button variant="outline" onClick={() => void setState({ q: null, connectionId: null, archiveState: null, archived: null })}>
                                    {t('Library.ClearFilters')}
                                </Button>
                            ) : null}
                            {firstReport ? (
                                <Button variant="link" asChild>
                                    <Link href={`/${organization}/work`}>{t('Library.GoToWork')}</Link>
                                </Button>
                            ) : null}
                        </>
                    )}
                </div>
            ) : (
                <div className="divide-y overflow-hidden rounded-lg border">
                    {query.data.documents.map(document => {
                        const labels = document.sourceLabels ?? [];
                        const updated = new Date(document.updatedAt);
                        return (
                            <div
                                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-within:bg-muted/40"
                                key={document.id}
                                data-testid="report-row"
                            >
                                {renaming?.id === document.id ? (
                                    <form
                                        className="flex min-w-0 flex-1 flex-wrap gap-2"
                                        onSubmit={event => {
                                            event.preventDefault();
                                            if (renaming.title.trim() && !rename.isPending) rename.mutate(renaming);
                                        }}
                                    >
                                        <Input
                                            ref={renameInput}
                                            autoFocus
                                            className="min-w-0 flex-1"
                                            aria-label={t('Title')}
                                            value={renaming.title}
                                            maxLength={160}
                                            disabled={rename.isPending}
                                            onChange={event => setRenaming({ ...renaming, title: event.target.value })}
                                            onKeyDown={event => {
                                                if (event.key === 'Escape' && !rename.isPending) {
                                                    event.preventDefault();
                                                    setRenaming(null);
                                                }
                                            }}
                                        />
                                        <Button type="submit" disabled={!renaming.title.trim() || rename.isPending}>
                                            {t('Save')}
                                        </Button>
                                        <Button type="button" variant="ghost" disabled={rename.isPending} onClick={() => setRenaming(null)}>
                                            {t('Cancel')}
                                        </Button>
                                    </form>
                                ) : (
                                    <div className="min-w-0 flex-1">
                                        <Link
                                            className="block truncate rounded-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                                            href={serializeReportList(`/${organization}/reports/${document.id}`, filters)}
                                            onNavigate={event => {
                                                event.preventDefault();
                                                // Flush throttled filter updates before changing the route.
                                                void setState({}).then(() => router.push(serializeReportList(`/${organization}/reports/${document.id}`, filters)));
                                            }}
                                        >
                                            {document.title}
                                        </Link>
                                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <span tabIndex={0} className="max-w-full truncate rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
                                                        {labels[0] ?? t('Library.NoSources')}
                                                        {labels.length > 1 ? ` +${labels.length - 1}` : ''}
                                                    </span>
                                                </TooltipTrigger>
                                                <TooltipContent className="max-w-xs break-words">{labels.join(', ') || t('Library.NoSources')}</TooltipContent>
                                            </Tooltip>
                                            <span aria-hidden="true">·</span>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <time tabIndex={0} dateTime={document.updatedAt} className="rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
                                                        {updated.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}
                                                    </time>
                                                </TooltipTrigger>
                                                <TooltipContent>{updated.toLocaleString(locale, { dateStyle: 'full', timeStyle: 'long' })}</TooltipContent>
                                            </Tooltip>
                                            {document.archivedAt ? <span className="rounded bg-muted px-1.5 py-0.5 text-foreground">{t('Archived')}</span> : null}
                                            {document.status === 'draft' ? <span className="rounded border px-1.5 py-0.5 text-foreground">{t('Incomplete')}</span> : null}
                                        </div>
                                    </div>
                                )}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="shrink-0"
                                            aria-label={t('Library.Actions', { title: document.title })}
                                            disabled={Boolean(renaming) || archive.isPending}
                                        >
                                            <MoreHorizontal className="size-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                        align="end"
                                        onCloseAutoFocus={event => {
                                            if (renaming) {
                                                event.preventDefault();
                                                renameInput.current?.focus();
                                            }
                                        }}
                                    >
                                        <DropdownMenuItem
                                            disabled={Boolean(document.archivedAt)}
                                            onSelect={() => setRenaming({ id: document.id, title: document.title, revision: document.revision })}
                                        >
                                            {t('Rename')}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => archive.mutate(document)}>{document.archivedAt ? t('Unarchive') : t('Archive')}</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
