'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { parseAsInteger, useQueryStates } from 'nuqs';
import { useLocale, useTranslations } from 'next-intl';

import type { ImportRunListItem, ImportRunListPage, ImportRunStatus } from '@dory/import';
import { DataTablePagination } from '@/components/@dory/ui/data-table-pagination';
import { X_CONNECTION_ID_KEY } from '@/app/config/app';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/registry/new-york-v4/ui/table';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const ACTIVE_STATUSES: ImportRunStatus[] = ['uploading', 'analyzing', 'queued', 'running'];

export function DataImportList({ organization, connectionId }: { organization: string; connectionId: string }) {
    const t = useTranslations('ImportWizard');
    const locale = useLocale();
    const router = useRouter();
    const [pagination, setPagination] = useQueryStates(
        {
            page: parseAsInteger.withDefault(1),
            pageSize: parseAsInteger.withDefault(DEFAULT_PAGE_SIZE),
        },
        { history: 'push' },
    );
    const page = Math.max(1, pagination.page);
    const pageSize = PAGE_SIZE_OPTIONS.includes(pagination.pageSize) ? pagination.pageSize : DEFAULT_PAGE_SIZE;
    const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }), [locale]);
    const listQuery = useQuery({
        queryKey: ['import-runs', connectionId, page, pageSize],
        queryFn: () => fetchImportRuns(connectionId, pageSize, (page - 1) * pageSize),
        placeholderData: previous => previous,
        refetchInterval: query => (query.state.data?.items.some(item => ACTIVE_STATUSES.includes(item.status)) ? 2000 : false),
    });
    const items = listQuery.data?.items ?? [];
    const total = listQuery.data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const listPath = `/${encodeURIComponent(organization)}/${encodeURIComponent(connectionId)}/import`;

    useEffect(() => {
        if (!listQuery.data || listQuery.isPlaceholderData || page <= totalPages) return;
        void setPagination({ page: totalPages });
    }, [listQuery.data, listQuery.isPlaceholderData, page, setPagination, totalPages]);

    const openRun = (runId: string) => router.push(`${listPath}/${encodeURIComponent(runId)}`);

    return (
        <div className="h-screen overflow-auto bg-n8">
            <main className="container mx-auto flex flex-col gap-6 px-6 py-8 lg:px-8 xl:px-12">
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">{t('List.Title')}</h1>
                        <p className="mt-1 text-sm text-muted-foreground">{t('List.Description')}</p>
                    </div>
                    <Button asChild>
                        <Link href={`${listPath}/new`}>
                            <Plus className="size-4" />
                            {t('List.NewImport')}
                        </Link>
                    </Button>
                </header>

                <section className="overflow-hidden rounded-lg border bg-card">
                    <div className="overflow-x-auto">
                        <Table className="min-w-[960px] [&_td]:px-4 [&_th]:px-4 [&_td:first-child]:pl-6 [&_th:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:last-child]:pr-6">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('List.Columns.Source')}</TableHead>
                                    <TableHead>{t('List.Columns.Target')}</TableHead>
                                    <TableHead>{t('List.Columns.Status')}</TableHead>
                                    <TableHead>{t('List.Columns.Progress')}</TableHead>
                                    <TableHead>{t('List.Columns.Created')}</TableHead>
                                    <TableHead>{t('List.Columns.Updated')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {listQuery.isLoading ? (
                                    Array.from({ length: 6 }, (_, index) => (
                                        <TableRow key={index}>
                                            <TableCell colSpan={6}>
                                                <Skeleton className="h-5 w-full" />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : listQuery.isError ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-32 text-center text-destructive">
                                            {listQuery.error instanceof Error ? listQuery.error.message : t('List.LoadFailed')}
                                        </TableCell>
                                    </TableRow>
                                ) : items.length ? (
                                    items.map(item => (
                                        <TableRow
                                            key={item.id}
                                            role="link"
                                            tabIndex={0}
                                            className="group cursor-pointer"
                                            onClick={() => openRun(item.id)}
                                            onKeyDown={event => {
                                                if (event.key !== 'Enter' && event.key !== ' ') return;
                                                event.preventDefault();
                                                openRun(item.id);
                                            }}
                                            aria-label={t('List.OpenRun', { source: item.sourceName ?? t('List.SourcePending') })}
                                        >
                                            <TableCell className="min-w-64 max-w-96">
                                                <div className="truncate font-medium group-hover:underline" title={item.sourceName ?? undefined}>
                                                    {item.sourceName ?? t('List.SourcePending')}
                                                </div>
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                    {[formatSource(item, t), item.sourceBytes == null ? null : formatBytes(item.sourceBytes)].filter(Boolean).join(' · ')}
                                                </div>
                                            </TableCell>
                                            <TableCell className="min-w-56 max-w-80">
                                                <span className="block truncate font-mono text-xs" title={formatTarget(item) ?? undefined}>
                                                    {formatTarget(item) ?? t('List.TargetPending')}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <ImportStatusBadge item={item} label={t(`Status.${item.status}`)} />
                                            </TableCell>
                                            <TableCell className="tabular-nums">{formatProgress(item, t)}</TableCell>
                                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{dateFormatter.format(new Date(item.createdAt))}</TableCell>
                                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{dateFormatter.format(new Date(item.updatedAt))}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-36 text-center text-muted-foreground">
                                            {t('List.Empty')}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <DataTablePagination
                        total={total}
                        pageIndex={page - 1}
                        pageSize={pageSize}
                        pageSizeOptions={PAGE_SIZE_OPTIONS}
                        onPageChange={nextPageIndex => void setPagination({ page: nextPageIndex + 1 })}
                        onPageSizeChange={nextPageSize => void setPagination({ page: 1, pageSize: nextPageSize })}
                        className="border-t px-6"
                    />
                </section>
            </main>
        </div>
    );
}

function ImportStatusBadge({ item, label }: { item: ImportRunListItem; label: string }) {
    const completed = item.status === 'completed';
    const variant =
        item.status === 'failed' || item.status === 'commit_unknown'
            ? 'destructive'
            : ACTIVE_STATUSES.includes(item.status)
              ? 'default'
              : item.status === 'canceled'
                ? 'outline'
                : 'secondary';
    return (
        <Badge variant={variant} className={completed ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : undefined}>
            {label}
        </Badge>
    );
}

async function fetchImportRuns(connectionId: string, limit: number, offset: number): Promise<ImportRunListPage> {
    const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const response = await fetch(`/api/import-runs?${query.toString()}`, { headers: { [X_CONNECTION_ID_KEY]: connectionId } });
    const payload = (await response.json().catch(() => null)) as { data?: ImportRunListPage; message?: string } | null;
    if (!response.ok || !payload?.data) throw new Error(payload?.message ?? `Request failed (${response.status})`);
    return payload.data;
}

function formatSource(item: ImportRunListItem, t: ReturnType<typeof useTranslations<'ImportWizard'>>) {
    return item.sourceFormat ? t(`Formats.${item.sourceFormat}`) : null;
}

function formatTarget(item: ImportRunListItem) {
    return item.target ? [item.target.database, item.target.schema, item.target.table].filter(Boolean).join('.') : null;
}

function formatProgress(item: ImportRunListItem, t: ReturnType<typeof useTranslations<'ImportWizard'>>) {
    if (item.status === 'completed') return t('List.InsertedRows', { rows: item.insertedRows.toLocaleString() });
    if (item.sourceRows == null) return '—';
    return t('List.ProcessedRows', { processed: item.processedRows.toLocaleString(), total: item.sourceRows.toLocaleString() });
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}
