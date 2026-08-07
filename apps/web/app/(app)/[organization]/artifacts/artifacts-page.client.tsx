'use client';

import { useDeferredValue, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Archive, BarChart3, Database, FileText, Loader2, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';

import { executeActionClient } from '@/lib/actions/client';
import type { ArtifactSummary, ArtifactType } from '@/lib/artifacts/types';
import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Input } from '@/registry/new-york-v4/ui/input';

const PAGE_SIZE = 50;
const TYPES = ['all', 'result_set', 'chart', 'file'] as const;
const TYPE_ORDER: ArtifactType[] = ['result_set', 'chart', 'file'];
const TYPE_ICONS = { result_set: Database, chart: BarChart3, file: FileText } as const;
const CREATOR_KEYS = new Set(['user', 'agent', 'mcp', 'automation']);

type ArtifactListOutput = { rows: ArtifactSummary[]; total: number };

function formatBytes(value: number | null) {
    if (value == null) return null;
    if (value < 1024) return `${value} B`;
    if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
    return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

export function ArtifactsPageClient({ organization }: { organization: string }) {
    const t = useTranslations('Artifacts');
    const organizationId = useOrganizationId();
    const [state, setState] = useQueryStates({
        q: parseAsString.withDefault(''),
        type: parseAsStringLiteral(TYPES).withDefault('all'),
        page: parseAsInteger.withDefault(1),
    });
    const deferredQuery = useDeferredValue(state.q.trim());
    const types = state.type === 'all' ? undefined : [state.type];
    const query = useQuery({
        queryKey: ['artifacts', organizationId, deferredQuery, state.type, state.page],
        queryFn: () =>
            executeActionClient<ArtifactListOutput>(
                'artifact.list',
                { query: deferredQuery || null, types, offset: (state.page - 1) * PAGE_SIZE, limit: PAGE_SIZE },
                { organizationId },
            ),
    });
    const grouped = useMemo(() => {
        const groups = new Map<ArtifactType, ArtifactSummary[]>(TYPE_ORDER.map(type => [type, []]));
        query.data?.rows.forEach(artifact => groups.get(artifact.type)?.push(artifact));
        return groups;
    }, [query.data?.rows]);
    const pageCount = Math.max(1, Math.ceil((query.data?.total ?? 0) / PAGE_SIZE));

    return (
        <div className="h-screen overflow-auto bg-n8">
            <main className="container mx-auto flex flex-col gap-5 px-12 pb-12 pt-8 lg:px-12 xl:px-8 2xl:px-4">
                <header>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Archive className="h-4 w-4" />
                        {t('Eyebrow')}
                    </div>
                    <h1 className="mt-2 text-2xl font-semibold">{t('Title')}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{t('Description')}</p>
                </header>

                <div className="flex flex-col gap-3 md:flex-row">
                    <div className="relative min-w-0 flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={state.q}
                            onChange={event => void setState({ q: event.target.value, page: 1 })}
                            placeholder={t('SearchPlaceholder')}
                            aria-label={t('SearchPlaceholder')}
                            className="pl-9"
                        />
                    </div>
                    <div className="flex gap-1 rounded-md border bg-card p-1" aria-label={t('TypeFilter')}>
                        {TYPES.map(type => (
                            <Button key={type} type="button" size="sm" variant={state.type === type ? 'secondary' : 'ghost'} onClick={() => void setState({ type, page: 1 })}>
                                {t(`Types.${type}`)}
                            </Button>
                        ))}
                    </div>
                </div>

                {query.isLoading ? (
                    <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('Loading')}
                    </div>
                ) : query.data?.rows.length ? (
                    <div className="space-y-6">
                        {TYPE_ORDER.map(type => {
                            const rows = grouped.get(type) ?? [];
                            if (!rows.length) return null;
                            const Icon = TYPE_ICONS[type];
                            return (
                                <section key={type} className="space-y-2">
                                    <div className="flex items-center gap-2 px-1">
                                        <Icon className="h-4 w-4 text-muted-foreground" />
                                        <h2 className="text-sm font-semibold">{t(`Groups.${type}`)}</h2>
                                        <Badge variant="secondary">{rows.length}</Badge>
                                    </div>
                                    <Card>
                                        <CardContent className="divide-y p-0">
                                            {rows.map(artifact => (
                                                <Link
                                                    key={artifact.id}
                                                    href={`/${encodeURIComponent(organization)}/artifacts/${encodeURIComponent(artifact.id)}`}
                                                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                >
                                                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <div className="truncate text-sm font-medium">{artifact.title}</div>
                                                            <Badge variant={artifact.status === 'ready' ? 'secondary' : 'destructive'}>{t(`Statuses.${artifact.status}`)}</Badge>
                                                        </div>
                                                        <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                                                            <span>{artifact.connectionName ?? artifact.comparisonName ?? t('UnknownSource')}</span>
                                                            <span>·</span>
                                                            <span>
                                                                {artifact.runTitle ??
                                                                    (CREATOR_KEYS.has(artifact.createdByActorType)
                                                                        ? t(`Creators.${artifact.createdByActorType}`)
                                                                        : artifact.createdByActorType)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {artifact.rowCount != null ? (
                                                        <span className="hidden text-xs text-muted-foreground sm:block">{t('Rows', { count: artifact.rowCount })}</span>
                                                    ) : null}
                                                    {formatBytes(artifact.byteSize) ? (
                                                        <span className="hidden text-xs text-muted-foreground md:block">{formatBytes(artifact.byteSize)}</span>
                                                    ) : null}
                                                    <time className="text-xs text-muted-foreground">{new Date(artifact.createdAt).toLocaleDateString()}</time>
                                                </Link>
                                            ))}
                                        </CardContent>
                                    </Card>
                                </section>
                            );
                        })}
                    </div>
                ) : (
                    <Card className="border-dashed">
                        <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
                            <Archive className="mb-4 h-9 w-9 text-muted-foreground" />
                            <h2 className="font-medium">{t('Empty')}</h2>
                            <p className="mt-1 max-w-md text-sm text-muted-foreground">{t('EmptyDescription')}</p>
                        </CardContent>
                    </Card>
                )}

                {pageCount > 1 ? (
                    <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" disabled={state.page <= 1} onClick={() => void setState({ page: state.page - 1 })}>
                            {t('Previous')}
                        </Button>
                        <span className="text-sm text-muted-foreground">{t('Page', { page: state.page, pages: pageCount })}</span>
                        <Button variant="outline" disabled={state.page >= pageCount} onClick={() => void setState({ page: state.page + 1 })}>
                            {t('Next')}
                        </Button>
                    </div>
                ) : null}
            </main>
        </div>
    );
}
