'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Clock3, GitCompareArrows, Layers3, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type { ConnectionListItem } from '@dory/shared/types/connections';

import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { useConnections } from '@/app/(app)/[organization]/connections/hooks/use-connections';
import { DataSourceCard } from '@/components/data-source/data-source-card';
import { DataSourceCell, type DataSourceCellInfo } from '@/components/data-source/data-source-cell';
import { executeActionClient } from '@/lib/actions/client';
import type { ComparisonClient } from '@/lib/comparison/client-types';
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
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { ComparisonRunStatus } from './components/comparison-status';

type ComparisonListOutput = { rows: ComparisonClient[]; total: number };

function endpointDataSource(endpoint: ComparisonClient['sourceEndpoint'], connectionsById: Map<string, ConnectionListItem>): DataSourceCellInfo {
    const connectionItem = connectionsById.get(endpoint.connectionId);
    const connection = connectionItem?.connection;
    const identity =
        connectionItem?.identities.find(item => item.id === endpoint.identityId) ?? (endpoint.identityId ? undefined : connectionItem?.identities.find(item => item.isDefault));

    return {
        connectionId: endpoint.connectionId,
        connectionName: connection?.name ?? endpoint.connectionId,
        connectionType: connection?.type,
        connectionHost: connection?.host,
        connectionPort: connection?.port,
        connectionHttpPort: connection?.httpPort,
        connectionEndpoint: connection?.path,
        databaseName: endpoint.database,
        identityName: identity?.name,
        identityUsername: identity?.username,
        identityRole: identity?.role,
    };
}

function normalizeDirection(value: string) {
    return value.replace(/\s+/g, '').replaceAll('->', '→');
}

function ComparisonCard({
    comparison,
    organization,
    connectionsById,
    onDelete,
}: {
    comparison: ComparisonClient;
    organization: string;
    connectionsById: Map<string, ConnectionListItem>;
    onDelete: (comparison: ComparisonClient) => void;
}) {
    const t = useTranslations('SchemaCompare');
    const run = comparison.latestRun;
    const summary = run?.summary;
    const riskCount = summary ? summary.highRisk + summary.mediumRisk : 0;
    const active = run?.status === 'running';
    const detailHref = `/${encodeURIComponent(organization)}/comparisons/${encodeURIComponent(comparison.id)}`;
    const editHref = `${detailHref}/edit`;
    const visibleObjectTypes = comparison.objectTypes.slice(0, 3);
    const remainingObjectTypes = comparison.objectTypes.length - visibleObjectTypes.length;
    const objectTypesLabel = comparison.objectTypes.map(type => t(`Object.${type}`)).join(', ');
    const visibleObjectTypesLabel = visibleObjectTypes.map(type => t(`Object.${type}`)).join(' · ');
    const objectTypesSummary = remainingObjectTypes > 0 ? `${visibleObjectTypesLabel} · +${remainingObjectTypes}` : visibleObjectTypesLabel;
    const databaseDirection = `${comparison.sourceEndpoint.database} → ${comparison.targetEndpoint.database}`;
    const showDatabaseDirection = normalizeDirection(comparison.name) !== normalizeDirection(databaseDirection);

    return (
        <DataSourceCard data-testid="comparison-card" className="relative h-full gap-3 p-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0 text-base font-medium">
                    <Link
                        href={detailHref}
                        className="block truncate after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                    >
                        {comparison.name}
                    </Link>
                </div>
                <div className="flex items-center gap-1">
                    <ComparisonRunStatus run={run} />
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="relative z-20 size-7 text-muted-foreground hover:text-foreground"
                                aria-label={`${comparison.name}: ${t('Edit.Action')} / ${t('Delete')}`}
                            >
                                <MoreHorizontal />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                            {active ? (
                                <DropdownMenuItem disabled>
                                    <Pencil />
                                    {t('Edit.Action')}
                                </DropdownMenuItem>
                            ) : (
                                <DropdownMenuItem asChild>
                                    <Link href={editHref}>
                                        <Pencil />
                                        {t('Edit.Action')}
                                    </Link>
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem variant="destructive" disabled={active} onSelect={() => onDelete(comparison)}>
                                <Trash2 />
                                {t('Delete')}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                <div className="relative z-10 min-w-0">
                    <span className="sr-only">{t('Current')}</span>
                    <DataSourceCell dataSource={endpointDataSource(comparison.sourceEndpoint, connectionsById)} className="max-w-full" />
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="relative z-10 min-w-0">
                    <span className="sr-only">{t('Desired')}</span>
                    <DataSourceCell dataSource={endpointDataSource(comparison.targetEndpoint, connectionsById)} className="max-w-full" />
                </div>
            </div>

            <div className="mt-auto grid gap-1.5 text-xs text-muted-foreground">
                <div className="flex min-w-0 items-center gap-1.5" title={objectTypesLabel}>
                    <Layers3 className="size-3.5 shrink-0" aria-hidden="true" />
                    {showDatabaseDirection ? (
                        <>
                            <span className="max-w-[45%] truncate font-mono text-foreground/70" title={databaseDirection}>
                                {databaseDirection}
                            </span>
                            <span aria-hidden="true">·</span>
                        </>
                    ) : null}
                    <span className="truncate">{objectTypesSummary}</span>
                </div>
                <div className="flex min-w-0 items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-1.5">
                        <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{run ? t('List.LastChecked', { date: new Date(run.startedAt).toLocaleString() }) : t('List.NeverChecked')}</span>
                    </span>
                    {riskCount > 0 ? <span className="shrink-0">{t('List.Risks', { count: riskCount })}</span> : null}
                </div>
            </div>
        </DataSourceCard>
    );
}

export function ComparisonsPageClient({ organization }: { organization: string }) {
    const t = useTranslations('SchemaCompare');
    const queryClient = useQueryClient();
    const organizationId = useOrganizationId();
    const comparisonsKey = ['comparisons', organizationId] as const;
    const [pendingDelete, setPendingDelete] = useState<ComparisonClient | null>(null);
    const comparisonsQuery = useQuery({
        queryKey: comparisonsKey,
        queryFn: () => executeActionClient<ComparisonListOutput>('comparison.list', { limit: 100 }, { organizationId }),
        refetchInterval: query => (query.state.data?.rows.some(comparison => comparison.latestRun?.status === 'running') ? 1500 : false),
    });
    const connectionsQuery = useConnections(organizationId);
    const connectionsById = useMemo(() => new Map((connectionsQuery.data ?? []).map(item => [item.connection.id, item])), [connectionsQuery.data]);
    const deleteMutation = useMutation({
        mutationFn: (comparisonId: string) =>
            executeActionClient<{ deleted: string[] }>(
                'comparison.delete',
                { comparisonId },
                {
                    organizationId,
                    confirmationToken: 'user-confirmed',
                    reason: 'Delete Comparison and immutable run history',
                },
            ),
        onSuccess: (_, comparisonId) => {
            queryClient.setQueryData<ComparisonListOutput>(comparisonsKey, current => {
                if (!current) return current;
                return {
                    rows: current.rows.filter(comparison => comparison.id !== comparisonId),
                    total: Math.max(0, current.total - 1),
                };
            });
            setPendingDelete(null);
            toast.success(t('List.Deleted'));
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.DeleteFailed')),
    });

    return (
        <div className="bg-n8 h-screen overflow-auto">
            <main className="container mx-auto flex flex-col gap-5 px-12 pt-8 pb-12 lg:px-12 xl:px-8 2xl:px-4">
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <GitCompareArrows className="h-4 w-4" />
                            {t('List.Eyebrow')}
                        </div>
                        <h1 className="mt-2 text-2xl font-semibold">{t('List.Title')}</h1>
                        <p className="mt-1 text-sm text-muted-foreground">{t('List.Description')}</p>
                    </div>
                    <Button asChild>
                        <Link href={`/${encodeURIComponent(organization)}/comparisons/new`}>
                            <Plus />
                            {t('List.New')}
                        </Link>
                    </Button>
                </header>

                {comparisonsQuery.isLoading ? (
                    <div className="flex h-48 items-center justify-center text-muted-foreground">
                        <Loader2 className="mr-2 animate-spin" />
                        {t('Loading')}
                    </div>
                ) : comparisonsQuery.data?.rows.length ? (
                    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 min-[2200px]:grid-cols-4">
                        {comparisonsQuery.data.rows.map(comparison => (
                            <ComparisonCard key={comparison.id} comparison={comparison} organization={organization} connectionsById={connectionsById} onDelete={setPendingDelete} />
                        ))}
                    </section>
                ) : (
                    <Card className="border-dashed">
                        <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
                            <GitCompareArrows className="mb-4 h-9 w-9 text-muted-foreground" />
                            <h2 className="font-medium">{t('List.Empty')}</h2>
                            <p className="mt-1 max-w-md text-sm text-muted-foreground">{t('List.EmptyDescription')}</p>
                            <Button asChild className="mt-5">
                                <Link href={`/${encodeURIComponent(organization)}/comparisons/new`}>
                                    <Plus />
                                    {t('List.New')}
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                )}
            </main>

            <AlertDialog
                open={Boolean(pendingDelete)}
                onOpenChange={open => {
                    if (!open && !deleteMutation.isPending) setPendingDelete(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('DeleteDialog.Title')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('DeleteDialog.Description')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteMutation.isPending}>{t('Cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={deleteMutation.isPending}
                            onClick={event => {
                                event.preventDefault();
                                if (pendingDelete) deleteMutation.mutate(pendingDelete.id);
                            }}
                        >
                            {deleteMutation.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                            {t('Delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
