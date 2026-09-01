'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, BarChart3, Bot, Database, Download, FileText, Loader2, MoreHorizontal, PanelTop, Pin, PinOff, Search, Star, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { parseAsBoolean, parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import type { ArtifactDetail, ArtifactSummary, ArtifactType } from '@/lib/artifacts/types';
import { buildArtifactHandoffPrompt } from '@/lib/artifacts/handoff-prompt';
import { buildArtifactWorkspacePath } from '@/lib/artifacts/workspace-url';
import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
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

const PAGE_SIZE = 50;
const TYPES = ['all', 'result_set', 'chart'] as const;
const TYPE_ORDER: ArtifactType[] = ['result_set', 'chart'];
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

function retentionLabel(artifact: ArtifactSummary, t: ReturnType<typeof useTranslations<'Artifacts'>>) {
    if (artifact.pinnedAt) return t('Retention.Pinned');
    if (!artifact.expiresAt) return t('Retention.Stored');
    return t('Retention.Temporary', { days: artifact.retentionDays ?? 1 });
}

function creatorLabel(artifact: ArtifactSummary, t: ReturnType<typeof useTranslations<'Artifacts'>>) {
    if (artifact.createdByName) return t('CreatedBy', { creator: artifact.createdByName });
    const creator = CREATOR_KEYS.has(artifact.createdByActorType) ? t(`Creators.${artifact.createdByActorType}`) : artifact.createdByActorType;
    if (artifact.agentRunId && artifact.runTitle) return t('CreatedByAgent', { title: artifact.runTitle });
    return t('CreatedBy', { creator });
}

function ArtifactRowActions({
    artifact,
    organization,
    onDelete,
    onPin,
    onUnpin,
}: {
    artifact: ArtifactSummary;
    organization: string;
    onDelete: () => void;
    onPin: () => void;
    onUnpin: () => void;
}) {
    const t = useTranslations('Artifacts.Viewer');
    const router = useRouter();
    const organizationId = useOrganizationId();
    const artifactPath = `/${encodeURIComponent(organization)}/artifacts/${encodeURIComponent(artifact.id)}`;
    const loadDetail = () => executeActionClient<ArtifactDetail>('artifact.get', { artifactId: artifact.id }, { organizationId });

    const openArtifact = async () => {
        try {
            const detail = await loadDetail();
            router.push(detail.workspaceTarget ? buildArtifactWorkspacePath(organization, artifact.id, detail.workspaceTarget.connectionId) : artifactPath);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('ActionFailed'));
        }
    };
    const continueWithAgent = async () => {
        try {
            const detail = await loadDetail();
            await navigator.clipboard.writeText(buildArtifactHandoffPrompt(detail, window.location.origin + artifactPath));
            toast.success(t('AgentTaskCopied'));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('ActionFailed'));
        }
    };
    const exportArtifact = async (format: 'csv' | 'parquet') => {
        try {
            const detail = await loadDetail();
            if (!detail.sourceResultSetId) throw new Error(t('ActionFailed'));
            const output = await executeActionClient<{ artifactId: string; downloadUrl: string }>(
                'resultSet.export.create',
                {
                    resultSetId: detail.sourceResultSetId,
                    format,
                },
                { organizationId },
            );
            window.location.assign(output.downloadUrl);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('ActionFailed'));
        }
    };
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t('MoreActions')}>
                    <MoreHorizontal />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void openArtifact()}>
                    <PanelTop />
                    {t('Open')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void continueWithAgent()}>
                    <Bot />
                    {t('ContinueWithAgent')}
                </DropdownMenuItem>
                {artifact.sourceResultSetId ? (
                    artifact.pinnedAt ? (
                        <DropdownMenuItem onSelect={onUnpin}>
                            <PinOff />
                            {t('Unpin')}
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem onSelect={onPin}>
                            <Pin />
                            {t('Pin')}
                        </DropdownMenuItem>
                    )
                ) : null}
                {artifact.type === 'result_set' ? (
                    <>
                        <DropdownMenuItem onSelect={() => void exportArtifact('csv')}>
                            <Download />
                            {t('Export')} CSV
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void exportArtifact('parquet')}>
                            <Download />
                            {t('Export')} Parquet
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => router.push(artifactPath)}>
                            <BarChart3 />
                            {t('CreateChart')}
                        </DropdownMenuItem>
                    </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>
                    <Trash2 />
                    {t('Delete')}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function ArtifactsPageClient({ organization }: { organization: string }) {
    const t = useTranslations('Artifacts');
    const organizationId = useOrganizationId();
    const queryClient = useQueryClient();
    const [artifactToDelete, setArtifactToDelete] = useState<ArtifactSummary | null>(null);
    const [state, setState] = useQueryStates({
        q: parseAsString.withDefault(''),
        type: parseAsStringLiteral(TYPES).withDefault('all'),
        pinned: parseAsBoolean.withDefault(false),
        page: parseAsInteger.withDefault(1),
    });
    const deferredQuery = useDeferredValue(state.q.trim());
    const types = state.type === 'all' ? TYPE_ORDER : [state.type];
    const query = useQuery({
        queryKey: ['artifacts', organizationId, deferredQuery, state.type, state.pinned, state.page],
        queryFn: () =>
            executeActionClient<ArtifactListOutput>(
                'artifact.list',
                { query: deferredQuery || null, types, pinnedOnly: state.pinned, offset: (state.page - 1) * PAGE_SIZE, limit: PAGE_SIZE },
                { organizationId },
            ),
    });
    const deleteMutation = useMutation({
        mutationFn: (artifactId: string) => executeActionClient<{ id: string; title: string }>('artifact.delete', { artifactId }, { organizationId }),
        onSuccess: () => {
            setArtifactToDelete(null);
            void queryClient.invalidateQueries({ queryKey: ['artifacts', organizationId] });
            toast.success(t('Deleted'));
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('ActionFailed')),
    });
    const pinMutation = useMutation({
        mutationFn: (artifactId: string) => executeActionClient<{ id: string; title: string }>('artifact.pin', { artifactId }, { organizationId }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['artifacts', organizationId] });
            toast.success(t('Pinned'));
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('ActionFailed')),
    });
    const unpinMutation = useMutation({
        mutationFn: (artifactId: string) => executeActionClient<{ id: string; title: string }>('artifact.unpin', { artifactId }, { organizationId }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['artifacts', organizationId] });
            toast.success(t('Unpinned'));
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('ActionFailed')),
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

                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="relative min-w-0 md:w-full md:max-w-2xl">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={state.q}
                            onChange={event => void setState({ q: event.target.value, page: 1 })}
                            placeholder={t('SearchPlaceholder')}
                            aria-label={t('SearchPlaceholder')}
                            className="h-10 pl-9"
                        />
                    </div>
                    <div className="flex h-10 shrink-0 gap-1 rounded-md border bg-card p-1" aria-label={t('TypeFilter')}>
                        {TYPES.map(type => (
                            <Button key={type} type="button" size="sm" variant={state.type === type ? 'secondary' : 'ghost'} onClick={() => void setState({ type, page: 1 })}>
                                {t(`Types.${type}`)}
                            </Button>
                        ))}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={state.pinned ? 'secondary' : 'ghost'}
                                    aria-label={t('PinnedOnly')}
                                    onClick={() => void setState({ pinned: !state.pinned, page: 1 })}
                                >
                                    <Star className={state.pinned ? 'fill-current' : undefined} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('PinnedOnly')}</TooltipContent>
                        </Tooltip>
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
                                    <Card className="py-0">
                                        <CardContent className="p-0">
                                            <div className="hidden h-10 items-center gap-4 border-b bg-muted/30 px-4 text-xs font-medium text-muted-foreground lg:grid lg:grid-cols-[minmax(20rem,2fr)_minmax(9rem,1fr)_6rem_6rem_10rem_7rem]">
                                                <span>{t('Columns.Title')}</span>
                                                <span>{t('Columns.Source')}</span>
                                                <span>{t('Columns.Rows')}</span>
                                                <span>{t('Columns.Size')}</span>
                                                <span>{t('Columns.Retention')}</span>
                                                <span className="text-right">{t('Columns.Actions')}</span>
                                            </div>
                                            {rows.map(artifact => (
                                                <div
                                                    key={artifact.id}
                                                    className="grid min-h-20 items-center gap-4 border-b px-4 py-3 last:border-b-0 lg:grid-cols-[minmax(20rem,2fr)_minmax(9rem,1fr)_6rem_6rem_10rem_7rem]"
                                                >
                                                    <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:flex lg:items-center lg:gap-3">
                                                        <Icon className="hidden h-4 w-4 shrink-0 text-muted-foreground lg:block" />
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <Link
                                                                    href={`/${encodeURIComponent(organization)}/artifacts/${encodeURIComponent(artifact.id)}`}
                                                                    className="truncate text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                                >
                                                                    {artifact.title}
                                                                </Link>
                                                                <Badge variant={artifact.status === 'ready' ? 'secondary' : 'destructive'}>
                                                                    {t(`Statuses.${artifact.status}`)}
                                                                </Badge>
                                                                {artifact.pinnedAt ? (
                                                                    <Pin className="h-3.5 w-3.5 text-muted-foreground" aria-label={t('Retention.Pinned')} />
                                                                ) : null}
                                                            </div>
                                                            <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                                                                <span>{artifact.connectionName ?? artifact.comparisonName ?? t('UnknownSource')}</span>
                                                                <span>·</span>
                                                                <span>{creatorLabel(artifact, t)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span className="hidden truncate text-xs text-muted-foreground lg:block">
                                                        {artifact.connectionName ?? artifact.comparisonName ?? t('UnknownSource')}
                                                    </span>
                                                    <span className="hidden text-xs text-muted-foreground lg:block">
                                                        {artifact.rowCount == null ? '—' : t('Rows', { count: artifact.rowCount })}
                                                    </span>
                                                    <span className="hidden text-xs text-muted-foreground lg:block">{formatBytes(artifact.byteSize) ?? '—'}</span>
                                                    <span className="hidden text-xs text-muted-foreground lg:block">{retentionLabel(artifact, t)}</span>
                                                    <div className="flex items-center justify-end gap-1 lg:col-start-6 lg:row-start-1">
                                                        <ArtifactRowActions
                                                            artifact={artifact}
                                                            organization={organization}
                                                            onDelete={() => setArtifactToDelete(artifact)}
                                                            onPin={() => pinMutation.mutate(artifact.id)}
                                                            onUnpin={() => unpinMutation.mutate(artifact.id)}
                                                        />
                                                    </div>
                                                </div>
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
            <AlertDialog open={Boolean(artifactToDelete)} onOpenChange={open => !open && setArtifactToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('DeleteDialog.Title')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('DeleteDialog.Description', { title: artifactToDelete?.title ?? '' })}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('DeleteDialog.Cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-white hover:bg-destructive/90"
                            disabled={deleteMutation.isPending}
                            onClick={event => {
                                event.preventDefault();
                                if (artifactToDelete) deleteMutation.mutate(artifactToDelete.id);
                            }}
                        >
                            {t('DeleteDialog.Confirm')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
