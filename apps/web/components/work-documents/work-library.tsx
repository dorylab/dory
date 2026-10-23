'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parseAsBoolean, parseAsString, useQueryStates } from 'nuqs';
import { toast } from 'sonner';
import type { WorkDocumentSummary } from '@dory/shared/types/work-document';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { workRequest } from '@/lib/work-documents/client';
export function WorkLibrary() {
    const t = useTranslations('WorkDocuments');
    const { organization } = useParams<{ organization: string }>();
    const [state, setState] = useQueryStates({ q: parseAsString.withDefault(''), connectionId: parseAsString.withDefault(''), archived: parseAsBoolean.withDefault(false) });
    const [renaming, setRenaming] = useState<{ id: string; title: string; revision: number } | null>(null);
    const client = useQueryClient();
    const query = useQuery({
        queryKey: ['work-documents', organization, state],
        queryFn: () =>
            workRequest<{ documents: WorkDocumentSummary[] }>(
                `/api/work-documents?q=${encodeURIComponent(state.q)}&connectionId=${encodeURIComponent(state.connectionId)}&archived=${state.archived}`,
            ),
    });
    const sources = useQuery({ queryKey: ['data-agent', organization], queryFn: () => workRequest<{ connections: Array<{ id: string; name: string }> }>('/api/data-agent') });
    const archive = useMutation({
        mutationFn: (document: WorkDocumentSummary) => workRequest(`/api/work-documents/${document.id}`, { action: 'archive', archived: !document.archivedAt }),
        onSuccess: () => client.invalidateQueries({ queryKey: ['work-documents', organization] }),
        onError: error => toast.error(error.message),
    });
    const rename = useMutation({
        mutationFn: (document: NonNullable<typeof renaming>) =>
            workRequest(`/api/work-documents/${document.id}`, { action: 'rename', title: document.title, expectedRevision: document.revision }),
        onSuccess: () => {
            setRenaming(null);
            return client.invalidateQueries({ queryKey: ['work-documents', organization] });
        },
        onError: error => toast.error(error.message),
    });
    return (
        <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Work</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{t('LibraryDescription')}</p>
                </div>
                <Button asChild>
                    <Link href={`/${organization}/data-agent`}>{t('CreateWork')}</Link>
                </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <Input className="max-w-sm" value={state.q} onChange={event => void setState({ q: event.target.value })} placeholder={t('Search')} />
                <select
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    aria-label={t('Scope')}
                    value={state.connectionId}
                    onChange={event => void setState({ connectionId: event.target.value })}
                >
                    <option value="">{t('AllSources')}</option>
                    {sources.data?.connections.map(source => (
                        <option key={source.id} value={source.id}>
                            {source.name}
                        </option>
                    ))}
                </select>
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={state.archived} onChange={event => void setState({ archived: event.target.checked })} />
                    {t('ShowArchived')}
                </label>
            </div>
            {query.error ? (
                <p role="alert" className="text-destructive">
                    {query.error.message}
                </p>
            ) : null}
            {query.isPending ? (
                <p>{t('Loading')}</p>
            ) : !query.data?.documents.length ? (
                <p className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">{t('Empty')}</p>
            ) : (
                <div className="divide-y rounded-lg border">
                    {query.data.documents.map(document => (
                        <div className="flex items-center gap-4 p-4" key={document.id}>
                            {renaming?.id === document.id ? (
                                <div className="flex min-w-0 flex-1 gap-2">
                                    <Input
                                        aria-label={t('Title')}
                                        value={renaming.title}
                                        maxLength={160}
                                        onChange={event => setRenaming({ ...renaming, title: event.target.value })}
                                    />
                                    <Button disabled={!renaming.title.trim() || rename.isPending} onClick={() => rename.mutate(renaming)}>
                                        {t('Save')}
                                    </Button>
                                    <Button variant="ghost" onClick={() => setRenaming(null)}>
                                        {t('Cancel')}
                                    </Button>
                                </div>
                            ) : (
                                <Link className="min-w-0 flex-1" href={`/${organization}/works/${document.id}`}>
                                    <p className="truncate font-medium hover:underline">{document.title}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {new Date(document.updatedAt).toLocaleString()} · v{document.revision} ·{' '}
                                        {document.archivedAt ? t('Archived') : document.status === 'draft' ? t('Incomplete') : t('Ready')}
                                    </p>
                                </Link>
                            )}
                            <Button variant="ghost" disabled={Boolean(document.archivedAt)} onClick={() => setRenaming(document)}>
                                {t('Rename')}
                            </Button>
                            <Button variant="ghost" disabled={archive.isPending} onClick={() => archive.mutate(document)}>
                                {document.archivedAt ? t('Unarchive') : t('Archive')}
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
