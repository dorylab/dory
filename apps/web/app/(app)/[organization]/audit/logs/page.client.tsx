'use client';

import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, RefreshCw, Search } from 'lucide-react';

import { Alert, AlertDescription } from '@/registry/new-york-v4/ui/alert';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/registry/new-york-v4/ui/select';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/registry/new-york-v4/ui/table';
import { cn } from '@dory/web-utils';
import { getAuditSourceGroup, type AuditItem, type AuditSearchResult, type QueryStatus } from '@dory/shared/types/audit';

type AuditLogsPageClientProps = {
    organizationId: string;
};

type ApiResponse<T> = {
    code: number;
    message?: string;
    data?: T;
};

type StatusFilter = 'all' | QueryStatus;
type SourceGroupFilter = 'all' | 'user' | 'dory_system' | 'ai' | 'automation' | 'mcp';

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

export default function AuditLogsPageClient({ organizationId }: AuditLogsPageClientProps) {
    const [searchText, setSearchText] = useState('');
    const [submittedSearchText, setSubmittedSearchText] = useState('');
    const [status, setStatus] = useState<StatusFilter>('all');
    const [sourceGroup, setSourceGroup] = useState<SourceGroupFilter>('all');
    const [cursorStack, setCursorStack] = useState<string[]>([]);
    const cursor = cursorStack[cursorStack.length - 1] ?? null;

    const query = useQuery({
        queryKey: ['audit-logs', organizationId, submittedSearchText, status, cursor],
        queryFn: () =>
            fetchAuditLogs({
                q: submittedSearchText,
                status,
                cursor,
            }),
        retry: false,
        staleTime: 10_000,
    });

    const rows = useMemo(() => {
        const items = query.data?.items ?? [];
        if (sourceGroup === 'all') return items;
        return items.filter(item => getAuditSourceGroup(item.source) === sourceGroup);
    }, [query.data?.items, sourceGroup]);

    function submitSearch(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setCursorStack([]);
        setSubmittedSearchText(searchText.trim());
    }

    function handleStatusChange(value: string) {
        setCursorStack([]);
        setStatus(value as StatusFilter);
    }

    function handleSourceGroupChange(value: string) {
        setSourceGroup(value as SourceGroupFilter);
    }

    return (
        <div className="flex min-h-0 w-full flex-1 flex-col gap-4 px-6 py-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
                    <p className="text-sm text-muted-foreground">SQL audit records for this organization.</p>
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => query.refetch()} disabled={query.isFetching}>
                    <RefreshCw className={cn('size-4', query.isFetching && 'animate-spin')} />
                    Refresh
                </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <form onSubmit={submitSearch} className="flex min-w-[280px] flex-1 items-center gap-2">
                    <div className="relative min-w-[220px] flex-1">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Search SQL text" className="pl-8" />
                    </div>
                    <Button type="submit" variant="secondary">
                        Search
                    </Button>
                </form>
                <Select value={status} onValueChange={handleStatusChange}>
                    <SelectTrigger className="w-[150px]">{STATUS_OPTIONS.find(option => option.value === status)?.label}</SelectTrigger>
                    <SelectContent>
                        {STATUS_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={sourceGroup} onValueChange={handleSourceGroupChange}>
                    <SelectTrigger className="w-[160px]">{SOURCE_GROUP_OPTIONS.find(option => option.value === sourceGroup)?.label}</SelectTrigger>
                    <SelectContent>
                        {SOURCE_GROUP_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {query.isError ? (
                <Alert variant="destructive">
                    <AlertCircle className="size-4" />
                    <AlertDescription>{query.error instanceof Error ? query.error.message : 'Failed to load audit logs.'}</AlertDescription>
                </Alert>
            ) : null}

            <div className="min-h-0 overflow-hidden rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[170px]">Time</TableHead>
                            <TableHead className="w-[110px]">Status</TableHead>
                            <TableHead className="w-[145px]">Source</TableHead>
                            <TableHead className="w-[210px]">Connection</TableHead>
                            <TableHead className="w-[190px]">DB identity</TableHead>
                            <TableHead>SQL</TableHead>
                            <TableHead className="w-[110px] text-right">Duration</TableHead>
                            <TableHead className="w-[90px] text-right">Rows</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {query.isLoading ? (
                            Array.from({ length: 8 }).map((_, index) => (
                                <TableRow key={index}>
                                    <TableCell colSpan={8}>
                                        <Skeleton className="h-5 w-full" />
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : rows.length ? (
                            rows.map(item => <AuditLogRow key={item.id} item={item} />)
                        ) : (
                            <TableRow>
                                <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
                                    No audit records found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                    Showing {rows.length} {sourceGroup !== 'all' ? 'filtered ' : ''}records
                </p>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={!cursorStack.length || query.isFetching} onClick={() => setCursorStack(stack => stack.slice(0, -1))}>
                        Previous
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!query.data?.nextCursor || query.isFetching}
                        onClick={() => {
                            const nextCursor = query.data?.nextCursor;
                            if (nextCursor) setCursorStack(stack => [...stack, nextCursor]);
                        }}
                    >
                        Next
                    </Button>
                </div>
            </div>
        </div>
    );
}

function AuditLogRow({ item }: { item: AuditItem }) {
    const rowCount = item.rows_written ?? item.rows_read ?? null;
    const connectionLabel = item.connection_name || item.connection_id || 'Unknown';
    const identityLabel = item.identity_username || item.identity_name || item.identity_id || 'Unknown';

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
                <div className="max-w-[200px] truncate" title={connectionLabel}>
                    {connectionLabel}
                </div>
                {item.database_name ? <div className="max-w-[200px] truncate text-xs text-muted-foreground">{item.database_name}</div> : null}
            </TableCell>
            <TableCell>
                <div className="max-w-[180px] truncate" title={identityLabel}>
                    {identityLabel}
                </div>
                {item.identity_role || item.identity_database ? (
                    <div className="max-w-[180px] truncate text-xs text-muted-foreground">{[item.identity_role, item.identity_database].filter(Boolean).join(' / ')}</div>
                ) : null}
            </TableCell>
            <TableCell>
                <code className="line-clamp-2 whitespace-normal break-all rounded bg-muted px-1.5 py-1 text-xs">{item.sql_text}</code>
                {item.error_message ? <div className="mt-1 line-clamp-2 text-xs text-destructive">{item.error_message}</div> : null}
            </TableCell>
            <TableCell className="text-right text-muted-foreground">{formatDuration(item.duration_ms)}</TableCell>
            <TableCell className="text-right text-muted-foreground">{rowCount ?? '-'}</TableCell>
        </TableRow>
    );
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

async function fetchAuditLogs(input: { q: string; status: StatusFilter; cursor: string | null }): Promise<AuditSearchResult> {
    const url = new URL('/api/audit/logs', window.location.origin);
    url.searchParams.set('limit', '50');
    if (input.q) url.searchParams.set('q', input.q);
    if (input.status !== 'all') url.searchParams.set('statuses', input.status);
    if (input.cursor) url.searchParams.set('cursor', input.cursor);

    const response = await fetch(url.toString(), {
        credentials: 'include',
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<AuditSearchResult> | null;

    if (!response.ok || payload?.code !== 0 || !payload.data) {
        throw new Error(payload?.message ?? 'Failed to load audit logs');
    }

    return payload.data;
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
