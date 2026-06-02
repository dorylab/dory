'use client';

import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CircleUserRound, Database, Link2, Maximize2, Plug, RefreshCw, Search, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { format as formatSql } from 'sql-formatter';

import { SmartCodeBlock } from '@/components/@dory/ui/code-block/code-block';
import { DataTablePagination } from '@/components/@dory/ui/data-table-pagination';
import { Alert, AlertDescription } from '@/registry/new-york-v4/ui/alert';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/registry/new-york-v4/ui/hover-card';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/registry/new-york-v4/ui/table';
import { cn } from '@dory/web-utils';
import { getAuditSourceGroup, type AuditItem, type AuditSearchResult, type AuditSourceGroup, type QuerySource, type QueryStatus } from '@dory/shared/types/audit';
import { executeActionClient } from '@/lib/actions/client';
import { DatabaseTypeIcon, getDatabaseTypeMeta } from '../connections/components/database-type-icon';

type QueryAuditPageClientProps = {
    organizationId: string;
    showHeader?: boolean;
    embedded?: boolean;
};

type StatusFilter = 'all' | QueryStatus;
type SourceGroupFilter = 'all' | AuditSourceGroup;

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const SQL_PREVIEW_MAX_LENGTH = 64;

const QUERY_SOURCES: QuerySource[] = [
    'console',
    'chatbot',
    'api',
    'task',
    'user_sql_console',
    'user_table_preview',
    'dory_schema_metadata',
    'dory_monitoring',
    'ai_sql_runner',
    'ai_table_preview',
    'ai_schema_metadata',
    'ai_analysis',
    'automation_sql',
    'automation_ai_sql',
    'automation_schema_metadata',
    'mcp_sql_runner',
    'mcp_table_preview',
    'mcp_schema_metadata',
    'mcp_monitoring',
    'mcp_analysis',
];

const SOURCES_BY_GROUP = QUERY_SOURCES.reduce<Record<AuditSourceGroup, QuerySource[]>>(
    (acc, source) => {
        acc[getAuditSourceGroup(source)].push(source);
        return acc;
    },
    {
        user: [],
        dory_system: [],
        ai: [],
        automation: [],
        mcp: [],
    },
);

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
    { value: 'all', label: 'All statuses' },
    { value: 'success', label: 'Success' },
    { value: 'error', label: 'Error' },
    { value: 'denied', label: 'Denied' },
    { value: 'canceled', label: 'Canceled' },
];

const SOURCE_GROUP_OPTIONS: Array<{ value: SourceGroupFilter; label: string }> = [
    { value: 'all', label: 'All sources' },
    { value: 'user', label: 'User' },
    { value: 'dory_system', label: 'Dory system' },
    { value: 'ai', label: 'AI' },
    { value: 'automation', label: 'Automation' },
    { value: 'mcp', label: 'MCP' },
];

export default function QueryAuditPageClient({ organizationId, showHeader = true, embedded = false }: QueryAuditPageClientProps) {
    const [searchText, setSearchText] = useState('');
    const [submittedSearchText, setSubmittedSearchText] = useState('');
    const [status, setStatus] = useState<StatusFilter>('all');
    const [sourceGroup, setSourceGroup] = useState<SourceGroupFilter>('all');
    const [pageIndex, setPageIndex] = useState(0);
    const [pageSize, setPageSize] = useState(50);
    const [selectedSqlItem, setSelectedSqlItem] = useState<AuditItem | null>(null);

    const query = useQuery({
        queryKey: ['query-audit', organizationId, submittedSearchText, status, sourceGroup, pageIndex, pageSize],
        queryFn: () =>
            fetchQueryAuditRecords({
                q: submittedSearchText,
                status,
                sourceGroup,
                pageIndex,
                pageSize,
            }),
        retry: false,
        staleTime: 10_000,
    });

    const rows = query.data?.items ?? [];
    const total = query.data?.total ?? rows.length;
    const selectedSqlText = useMemo(() => (selectedSqlItem ? formatAuditSql(selectedSqlItem.sql_text) : ''), [selectedSqlItem]);

    function submitSearch(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setPageIndex(0);
        setSubmittedSearchText(searchText.trim());
    }

    function handleStatusChange(value: string) {
        setPageIndex(0);
        setStatus(value as StatusFilter);
    }

    function handleSourceGroupChange(value: string) {
        setPageIndex(0);
        setSourceGroup(value as SourceGroupFilter);
    }

    return (
        <div className={cn('flex h-full min-h-0 w-full flex-1 flex-col gap-4', !embedded && 'px-6 py-6')}>
            {showHeader ? (
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-semibold tracking-tight">Query Audit</h1>
                        <p className="text-sm text-muted-foreground">SQL query audit records for this organization.</p>
                    </div>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => query.refetch()} disabled={query.isFetching}>
                        <RefreshCw className={cn('size-4', query.isFetching && 'animate-spin')} />
                        Refresh
                    </Button>
                </div>
            ) : null}

            <form onSubmit={submitSearch} className="flex w-full flex-wrap items-center justify-between gap-2">
                <div className={cn('relative min-w-[240px]', embedded ? 'w-[420px] max-w-full' : 'w-[min(480px,100%)]')}>
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Search SQL text" className="pl-8" />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Select value={status} onValueChange={handleStatusChange}>
                        <SelectTrigger className="w-[150px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="end">
                            {STATUS_OPTIONS.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={sourceGroup} onValueChange={handleSourceGroupChange}>
                        <SelectTrigger className="w-[160px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="end">
                            {SOURCE_GROUP_OPTIONS.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {!showHeader ? (
                        <Button variant="ghost" size="icon" className="size-9" onClick={() => query.refetch()} disabled={query.isFetching} aria-label="Refresh" title="Refresh">
                            <RefreshCw className={cn('size-4', query.isFetching && 'animate-spin')} />
                        </Button>
                    ) : null}
                    <Button type="submit" variant="secondary">
                        Search
                    </Button>
                </div>
            </form>

            {query.isError ? (
                <Alert variant="destructive">
                    <AlertCircle className="size-4" />
                    <AlertDescription>{query.error instanceof Error ? query.error.message : 'Failed to load query audit records.'}</AlertDescription>
                </Alert>
            ) : null}

            <div className="min-h-[360px] flex-1 overflow-auto rounded-md border">
                <Table className="min-w-[1460px]">
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[170px]">Time</TableHead>
                            <TableHead className="w-[110px]">Status</TableHead>
                            <TableHead className="w-[145px]">Source</TableHead>
                            <TableHead className="w-[300px]">Data source</TableHead>
                            <TableHead className="w-[540px] min-w-[540px]">SQL</TableHead>
                            <TableHead className="w-[110px] text-right">Duration</TableHead>
                            <TableHead className="w-[90px] text-right">Rows</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {query.isLoading ? (
                            Array.from({ length: 8 }).map((_, index) => (
                                <TableRow key={index}>
                                    <TableCell colSpan={7}>
                                        <Skeleton className="h-5 w-full" />
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : rows.length ? (
                            rows.map(item => <QueryAuditRow key={item.id} item={item} onViewSql={setSelectedSqlItem} />)
                        ) : (
                            <TableRow>
                                <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                                    No audit records found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <DataTablePagination
                total={total}
                pageIndex={pageIndex}
                pageSize={pageSize}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                onPageChange={setPageIndex}
                onPageSizeChange={nextPageSize => {
                    setPageSize(nextPageSize);
                    setPageIndex(0);
                }}
                className="px-0 py-0"
            />

            <Dialog open={Boolean(selectedSqlItem)} onOpenChange={open => !open && setSelectedSqlItem(null)}>
                <DialogContent className="max-h-[85vh] sm:max-w-5xl">
                    <DialogHeader>
                        <DialogTitle>SQL</DialogTitle>
                        <DialogDescription>{selectedSqlItem ? `${formatDateTime(selectedSqlItem.created_at)} · ${selectedSqlItem.status}` : null}</DialogDescription>
                    </DialogHeader>
                    {selectedSqlItem ? (
                        <div className="min-h-0 space-y-3">
                            <SmartCodeBlock value={selectedSqlText} type="sql" showLineNumbers maxHeightClassName="max-h-[55vh]" />
                            {selectedSqlItem.error_message ? <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{selectedSqlItem.error_message}</div> : null}
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function QueryAuditRow({ item, onViewSql }: { item: AuditItem; onViewSql: (item: AuditItem) => void }) {
    const rowCount = item.rows_written ?? item.rows_read ?? null;
    const sqlText = useMemo(() => formatAuditSql(item.sql_text), [item.sql_text]);
    const sqlPreview = useMemo(() => formatInlineSql(sqlText), [sqlText]);

    return (
        <TableRow>
            <TableCell className="text-xs text-muted-foreground">{formatDateTime(item.created_at)}</TableCell>
            <TableCell>
                <StatusBadge status={item.status} />
            </TableCell>
            <TableCell>
                <div className="flex flex-col gap-1">
                    <Badge variant="outline" className="w-fit capitalize">
                        {getAuditSourceGroup(item.source).replace('_', ' ')}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{item.source}</span>
                </div>
            </TableCell>
            <TableCell>
                <DataSourceCell item={item} />
            </TableCell>
            <TableCell className="w-[540px] min-w-[540px] align-middle">
                <div className="flex min-w-0 items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded bg-muted/60 px-2 py-1 font-mono text-xs text-foreground" title={sqlPreview}>
                        {sqlPreview}
                    </code>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-full" onClick={() => onViewSql(item)} aria-label="View full SQL" title="View full SQL">
                        <Maximize2 className="size-3.5" />
                    </Button>
                </div>
                {item.error_message ? <div className="mt-1 line-clamp-2 text-xs text-destructive">{item.error_message}</div> : null}
            </TableCell>
            <TableCell className="text-right text-muted-foreground">{formatDuration(item.duration_ms)}</TableCell>
            <TableCell className="text-right text-muted-foreground">{rowCount ?? '-'}</TableCell>
        </TableRow>
    );
}

function DataSourceCell({ item }: { item: AuditItem }) {
    const connectionLabel = item.connection_name || item.connection_id || 'Unknown';
    const connectionType = item.connection_type ?? 'unknown';
    const typeMeta = getDatabaseTypeMeta(connectionType);
    const typeLabel = item.connection_type ? typeMeta.label : 'Unknown';
    const hostPortLabel = formatHostPort(item);
    const detailRows = [
        { label: 'Endpoint', value: hostPortLabel, icon: Link2 },
        { label: 'Database', value: item.database_name, icon: Database },
        { label: 'User', value: item.identity_username || item.identity_name || null, icon: CircleUserRound },
        { label: 'Role', value: item.identity_role, icon: User },
        { label: 'Source', value: item.source, icon: Plug },
    ].filter(row => row.value);

    return (
        <HoverCard openDelay={120} closeDelay={80}>
            <HoverCardTrigger asChild>
                <div className="group flex w-fit max-w-[280px] cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0}>
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-background transition-colors group-hover:border-foreground/30">
                        <DatabaseTypeIcon type={connectionType} className="max-h-4 max-w-4" fallbackClassName="text-[10px]" />
                    </div>
                    <div className="min-w-0">
                        <div className="truncate font-medium text-foreground transition-colors group-hover:text-foreground" title={connectionLabel}>
                            {connectionLabel}
                        </div>
                    </div>
                </div>
            </HoverCardTrigger>
            <HoverCardContent align="start" side="right" className="w-80 p-3">
                <div className="flex items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background">
                        <DatabaseTypeIcon type={connectionType} className="max-h-6 max-w-6" />
                    </div>
                    <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{connectionLabel}</div>
                        <div className="text-xs text-muted-foreground">{typeLabel}</div>
                    </div>
                </div>
                <div className="mt-3 space-y-1.5">
                    {detailRows.map(row => (
                        <DetailRow key={row.label} icon={row.icon} label={row.label} value={String(row.value)} />
                    ))}
                </div>
            </HoverCardContent>
        </HoverCard>
    );
}

function DetailRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
    return (
        <div className="grid grid-cols-[124px_minmax(0,1fr)] gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <Icon className="size-3.5 shrink-0" />
                <span className="truncate">{label}</span>
            </span>
            <span className="truncate font-medium" title={value}>
                {value}
            </span>
        </div>
    );
}

function formatHostPort(item: AuditItem) {
    if (item.connection_endpoint) return item.connection_endpoint;

    const host = item.connection_host?.trim();
    if (!host) return null;

    const port = item.connection_port ?? item.connection_http_port;
    return port ? `${host}:${port}` : host;
}

function formatAuditSql(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return '';

    const normalized = trimmed.replace(/\n{3,}/g, '\n\n');

    try {
        return formatSql(normalized, { language: 'sql' }).trim();
    } catch {
        return normalized;
    }
}

function formatInlineSql(value: string) {
    const inlineSql = value.replace(/\s+/g, ' ').trim();
    if (inlineSql.length <= SQL_PREVIEW_MAX_LENGTH) return inlineSql;
    return `${inlineSql.slice(0, SQL_PREVIEW_MAX_LENGTH - 3).trimEnd()}...`;
}

function StatusBadge({ status }: { status: QueryStatus }) {
    const className =
        status === 'success'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : status === 'error'
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : status === 'denied'
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                : 'border-muted-foreground/25 bg-muted text-muted-foreground';

    return (
        <Badge variant="outline" className={cn('capitalize', className)}>
            {status}
        </Badge>
    );
}

async function fetchQueryAuditRecords(input: { q: string; status: StatusFilter; sourceGroup: SourceGroupFilter; pageIndex: number; pageSize: number }): Promise<AuditSearchResult> {
    return executeActionClient<AuditSearchResult>('query.auditSearch', {
        limit: input.pageSize,
        offset: input.pageIndex * input.pageSize,
        q: input.q || undefined,
        statuses: input.status !== 'all' ? [input.status] : undefined,
        sources: input.sourceGroup !== 'all' ? SOURCES_BY_GROUP[input.sourceGroup] : undefined,
    });
}

function formatDateTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function formatDuration(value?: number | null) {
    if (value === null || value === undefined) return '-';
    if (value < 1000) return `${value} ms`;
    return `${(value / 1000).toFixed(2)} s`;
}
