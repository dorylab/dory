'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { ExternalLink, Info, Loader2, MoreHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { DataTablePagination } from '@/components/@dory/ui/data-table-pagination';
import { DataSourceCell, type DataSourceCellInfo } from '@/components/data-source/data-source-cell';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/registry/new-york-v4/ui/alert-dialog';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
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

async function deleteAgentRun(workId: string) {
    const response = await fetch(`/api/works/${encodeURIComponent(workId)}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.code !== 0) {
        throw new Error(payload?.message || 'Failed to delete Agent Run.');
    }
}

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
    const [pendingDelete, setPendingDelete] = useState<AgentRunListItem | null>(null);
    const deleteMutation = useMutation({
        mutationFn: deleteAgentRun,
        onSuccess: () => {
            toast.success('Agent Run deleted.');
            setPendingDelete(null);
            router.refresh();
        },
        onError: error => {
            toast.error(error instanceof Error ? error.message : 'Failed to delete Agent Run.');
        },
    });

    const pushPage = (nextPageIndex: number, nextPageSize = pageSize) => {
        const query = new URLSearchParams();
        query.set('page', String(nextPageIndex + 1));
        query.set('pageSize', String(nextPageSize));
        router.push(`${baseHref}?${query.toString()}`, { scroll: false });
    };

    return (
        <>
            <Table className="[&_td]:px-4 [&_th]:px-4 [&_td:first-child]:pl-6 [&_th:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:last-child]:pr-6">
                <TableHeader>
                    <TableRow>
                        <TableHead>Question</TableHead>
                        <TableHead>Data source</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last active</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
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
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 cursor-pointer" aria-label={`Actions for ${run.title}`}>
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-44">
                                            <DropdownMenuItem asChild>
                                                <Link href={run.workspaceHref}>
                                                    <ExternalLink className="h-4 w-4" />
                                                    Open Workspace
                                                </Link>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem asChild>
                                                <Link href={run.detailHref}>
                                                    <Info className="h-4 w-4" />
                                                    View Details
                                                </Link>
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                variant="destructive"
                                                onSelect={event => {
                                                    event.preventDefault();
                                                    setPendingDelete(run);
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                                Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
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
                className="border-t px-6"
            />
            <AlertDialog open={Boolean(pendingDelete)} onOpenChange={open => !open && !deleteMutation.isPending && setPendingDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Agent Run?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This removes <span className="font-medium text-foreground">{pendingDelete?.title ?? 'this Agent Run'}</span> from Agent Runs. Existing workspace data is
                            archived and hidden from this list.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={!pendingDelete || deleteMutation.isPending}
                            onClick={event => {
                                event.preventDefault();
                                if (!pendingDelete) return;
                                deleteMutation.mutate(pendingDelete.workId);
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
