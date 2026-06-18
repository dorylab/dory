'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { DataTablePagination } from '@/components/@dory/ui/data-table-pagination';
import { DataSourceCell, type DataSourceCellInfo } from '@/components/data-source/data-source-cell';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/registry/new-york-v4/ui/table';
import type { getAgentRunStatusVariant } from '@/lib/agent-runs/summary';

export type AgentRunListItem = {
    workId: string;
    title: string;
    dataSource: DataSourceCellInfo;
    statusLabel: string;
    statusVariant: ReturnType<typeof getAgentRunStatusVariant>;
    lastActiveLabel: string;
    detailHref: string;
    workspaceHref: string;
};

export function AgentRunsTable({
    runs,
    total,
    pageIndex,
    pageSize,
    pageSizeOptions,
    baseHref,
}: {
    runs: AgentRunListItem[];
    total: number;
    pageIndex: number;
    pageSize: number;
    pageSizeOptions: number[];
    baseHref: string;
}) {
    const router = useRouter();

    const pushPage = (nextPageIndex: number, nextPageSize = pageSize) => {
        const query = new URLSearchParams();
        query.set('page', String(nextPageIndex + 1));
        query.set('pageSize', String(nextPageSize));
        router.push(`${baseHref}?${query.toString()}`, { scroll: false });
    };

    return (
        <>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Question</TableHead>
                        <TableHead>Data source</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last active</TableHead>
                        <TableHead className="text-right">Workspace</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {runs.length ? (
                        runs.map(run => (
                            <TableRow
                                key={run.workId}
                                role="link"
                                tabIndex={0}
                                className="group cursor-pointer"
                                onClick={() => router.push(run.detailHref)}
                                onKeyDown={event => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        router.push(run.detailHref);
                                    }
                                }}
                                aria-label={`Open Agent Run ${run.title}`}
                            >
                                <TableCell className="min-w-[320px] max-w-[520px]">
                                    <div className="line-clamp-2 font-medium group-hover:underline" title={run.title}>
                                        {run.title}
                                    </div>
                                    <div className="mt-1 max-w-[360px] truncate font-mono text-xs text-muted-foreground">{run.workId}</div>
                                </TableCell>
                                <TableCell>
                                    <DataSourceCell dataSource={run.dataSource} emptyLabel="None" />
                                </TableCell>
                                <TableCell>
                                    <Badge variant={run.statusVariant}>{run.statusLabel}</Badge>
                                </TableCell>
                                <TableCell>{run.lastActiveLabel}</TableCell>
                                <TableCell className="text-right" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
                                    <Button asChild variant="outline" size="sm" className="cursor-pointer">
                                        <Link href={run.workspaceHref}>Open Workspace</Link>
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                                No Agent Runs yet.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
            <DataTablePagination
                total={total}
                pageIndex={pageIndex}
                pageSize={pageSize}
                pageSizeOptions={pageSizeOptions}
                onPageChange={nextPageIndex => pushPage(nextPageIndex)}
                onPageSizeChange={nextPageSize => pushPage(0, nextPageSize)}
                className="border-t"
            />
        </>
    );
}
