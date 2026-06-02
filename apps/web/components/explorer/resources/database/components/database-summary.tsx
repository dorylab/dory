'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAtomValue } from 'jotai';
import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/registry/new-york-v4/ui/alert';
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import { executeActionClient } from '@/lib/actions/client';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { buildExplorerListPath, buildExplorerObjectPath } from '@/lib/explorer/build-path';
import type { ExplorerBaseParams } from '@/lib/explorer/types';
import { cn } from '@dory/web-utils';
import { splitQualifiedName } from '@/components/explorer/core/explorer-store';
import { formatBytes, formatNumber } from '@/app/(app)/[organization]/components/table-browser/components/stats/components/formatters';
import type { DatabaseSummary as DatabaseSummaryData, DatabaseSummaryRecommendation, DatabaseSummaryTable } from '@dory/drivers/types';

type DatabaseSummaryProps = {
    baseParams?: ExplorerBaseParams;
    catalog?: string | null;
    database?: string | null;
    schema?: string | null;
};

const resolveParam = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

const decodeParam = (value?: string | null) => {
    if (!value) return value;
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

function formatTimestamp(value: string | null | undefined, locale: string) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date);
}

function formatDecimal(value?: number | null) {
    if (!Number.isFinite(value ?? NaN)) return '-';
    return new Intl.NumberFormat(undefined, {
        minimumFractionDigits: value && Number.isInteger(value) ? 0 : 1,
        maximumFractionDigits: 1,
    }).format(value as number);
}

function NullValue({ className, tooltip }: { className?: string; tooltip: string }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className={cn('text-muted-foreground', className)}>—</span>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{tooltip}</TooltipContent>
        </Tooltip>
    );
}

function renderNullableText(value: string | null | undefined, tooltip: string, className?: string) {
    if (!value || !value.trim()) return <NullValue className={className} tooltip={tooltip} />;
    return <span className={className}>{value}</span>;
}

function renderNullableOverflowText(value: string | null | undefined, tooltip: string, className?: string) {
    if (!value || !value.trim()) return <NullValue className={className} tooltip={tooltip} />;
    return <OverflowTooltip text={value} className={cn('block max-w-full truncate', className)} />;
}

function renderNullableNumber(value: number | null | undefined, formatter: (value: number | null | undefined) => string, tooltip: string, className?: string) {
    if (value === null || value === undefined) return <NullValue className={className} tooltip={tooltip} />;
    return <span className={className}>{formatter(value)}</span>;
}

function OverviewStat({ label, value }: { label: string; value: string }) {
    return (
        <div className="space-y-1">
            <div className="text-2xl font-semibold tracking-tight sm:text-3xl">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
        </div>
    );
}

function InsightPanel({ title, headline, children }: { title: string; headline: string; children: ReactNode }) {
    return (
        <div className="rounded-2xl bg-muted/40 p-5">
            <div className="space-y-2">
                <div className="text-sm font-medium">{title}</div>
                <div className="text-xl font-semibold tracking-tight">{headline}</div>
            </div>
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">{children}</div>
        </div>
    );
}

function CompactLine({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="flex min-w-0 items-baseline gap-2 text-sm">
            <span className="shrink-0 text-muted-foreground">{label}</span>
            <span className="min-w-0 font-medium text-foreground">{value}</span>
        </div>
    );
}

function QuickActionTile({ href, label }: { href: string; label: string }) {
    return (
        <Link href={href} className="group rounded-xl border border-border/70 bg-background/70 p-4 transition-colors hover:bg-background">
            <div className="text-sm font-medium leading-snug">{label}</div>
            <div className="mt-3 text-xs text-muted-foreground transition-colors group-hover:text-foreground/80">Open</div>
        </Link>
    );
}

function SectionCard({ id, title, description, children }: { id?: string; title: string; description: string; children: ReactNode }) {
    return (
        <Card id={id}>
            <CardHeader className="space-y-1">
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>{children}</CardContent>
        </Card>
    );
}

export default function DatabaseSummary({ baseParams, catalog, database, schema }: DatabaseSummaryProps) {
    const params = useParams<{ organization?: string | string[]; connectionId?: string | string[]; catalog?: string | string[]; database?: string | string[] }>();
    const currentConnection = useAtomValue(currentConnectionAtom);
    const t = useTranslations('CatalogSummary');
    const tCatalog = useTranslations('Catalog');
    const locale = useLocale();
    const [summary, setSummary] = useState<DatabaseSummaryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const databaseName = decodeParam(database ?? resolveParam(params?.database) ?? '') ?? '';
    const catalogName = decodeParam(catalog ?? resolveParam(params?.catalog) ?? null) ?? null;
    const organizationId = resolveParam(params?.organization);
    const connectionId = resolveParam(params?.connectionId) ?? currentConnection?.connection?.id;
    const nullTooltip = t('Null tooltip');
    const summaryTitle = schema ? t('Schema Summary') : t('Database Summary');
    const summaryDescription = schema ? t('Schema summary description') : t('Database summary description');

    const resolvedBaseParams = useMemo<ExplorerBaseParams | null>(() => {
        if (baseParams) return baseParams;
        if (!organizationId || !connectionId) return null;
        return {
            organization: organizationId,
            connectionId,
            catalog: catalogName ?? undefined,
        };
    }, [baseParams, catalogName, connectionId, organizationId]);

    const buildObjectHref = (tableName: string) => {
        if (!resolvedBaseParams) return null;
        const qualified = splitQualifiedName(tableName);
        return buildExplorerObjectPath(resolvedBaseParams, {
            database: databaseName,
            schema: qualified.schema,
            objectKind: 'table',
            name: qualified.name,
        });
    };

    const buildListHref = (listKind: 'tables' | 'views' | 'functions' | 'sequences') => {
        if (!resolvedBaseParams) return null;
        return buildExplorerListPath(resolvedBaseParams, {
            database: databaseName,
            schema: schema ?? undefined,
            listKind,
        });
    };

    useEffect(() => {
        let ignore = false;

        async function loadSummary() {
            if (!databaseName || !connectionId) return;
            setLoading(true);
            setError(null);

            try {
                const res = await executeActionClient<{ summary: DatabaseSummaryData }>(
                    'schema.getDatabaseSummary',
                    {
                        connectionId,
                        database: databaseName,
                        catalog: catalogName ?? undefined,
                        schema: schema ?? undefined,
                    },
                    { currentConnectionId: connectionId },
                );

                if (!ignore) {
                    setSummary(res.summary ?? null);
                }
            } catch (err) {
                console.error('Failed to fetch database summary:', err);
                if (!ignore) {
                    setSummary(null);
                    setError(t('Summary unavailable'));
                }
            } finally {
                if (!ignore) {
                    setLoading(false);
                }
            }
        }

        loadSummary();

        return () => {
            ignore = true;
        };
    }, [catalogName, connectionId, databaseName, schema, t]);

    const emptyTables = useMemo(() => summary?.tablesCount === 0, [summary]);

    const formatMetricValue = (value: number | null | undefined, formatter: (value: number | null | undefined) => string) => {
        if (value === null || value === undefined) return '—';
        return formatter(value);
    };

    const scaleHeadline = useMemo(() => {
        const distribution = summary?.tableSizeDistribution;
        const tablesCount = summary?.tablesCount ?? 0;

        if (!distribution || tablesCount === 0) {
            return t('No table size signal');
        }

        const smallTablesCount = distribution.smallTablesCount ?? 0;
        const mediumTablesCount = distribution.mediumTablesCount ?? 0;
        const largeTablesCount = distribution.largeTablesCount ?? 0;

        if (smallTablesCount === tablesCount && mediumTablesCount === 0 && largeTablesCount === 0) {
            return t('All tables are small');
        }

        if (smallTablesCount >= Math.max(1, Math.ceil(tablesCount / 2))) {
            return t('Mostly small tables');
        }

        return t('Mixed table sizes');
    }, [summary, t]);

    const scaleSupport = useMemo(() => {
        const distribution = summary?.tableSizeDistribution;

        if (!distribution) {
            return {
                counts: '—',
                note: t('No table size note'),
            };
        }

        const mediumTablesCount = formatMetricValue(distribution.mediumTablesCount, formatNumber);
        const largeTablesCount = formatMetricValue(distribution.largeTablesCount, formatNumber);
        const hasOnlySmallTables = (distribution.mediumTablesCount ?? 0) === 0 && (distribution.largeTablesCount ?? 0) === 0;

        return {
            counts: t('Medium large counts', {
                medium: mediumTablesCount,
                large: largeTablesCount,
            }),
            note: hasOnlySmallTables ? t('Good for quick exploration') : t('Start with the largest tables'),
        };
    }, [summary, t]);

    const objectMixHeadline = useMemo(() => {
        return t('Object mix headline', {
            tables: formatMetricValue(summary?.tablesCount, formatNumber),
            views: formatMetricValue(summary?.viewsCount, formatNumber),
        });
    }, [summary, t]);

    const objectMixSupport = useMemo(() => {
        return t('Object mix support', {
            materializedViews: formatMetricValue(summary?.materializedViewsCount, formatNumber),
            functions: formatMetricValue(summary?.functionsCount, formatNumber),
        });
    }, [summary, t]);

    const columnHeadline = useMemo(() => {
        return t('Avg columns insight', {
            value: formatMetricValue(summary?.columnComplexity?.averageColumnsPerTable, formatDecimal),
        });
    }, [summary, t]);

    const overviewMetaItems = useMemo(() => {
        if (!summary) {
            return [] as Array<{ key: string; label: string; value: ReactNode }>;
        }

        const items: Array<{ key: string; label: string; value: ReactNode }> = [];

        if (summary.engine === 'postgres' && summary.owner?.trim()) {
            items.push({
                key: 'owner',
                label: t('Owner'),
                value: renderNullableOverflowText(summary.owner, nullTooltip),
            });
        }

        if (summary.engine === 'postgres' && summary.materializedViewsCount !== null && summary.materializedViewsCount !== undefined) {
            items.push({
                key: 'materializedViewsCount',
                label: t('Materialized Views'),
                value: renderNullableNumber(summary.materializedViewsCount, formatNumber, nullTooltip),
            });
        }

        return items;
    }, [nullTooltip, summary, t]);

    const primaryTitle = summary?.schemaName ?? schema ?? summary?.databaseName ?? databaseName;
    const primaryCaption = schema
        ? t('Schema in database', { database: (summary?.databaseName ?? databaseName) || '—' })
        : catalogName
          ? t('Database in catalog', { catalog: catalogName })
          : summaryDescription;

    const reasonLabel = (reason: DatabaseSummaryRecommendation['reason']) => t(`RecommendationReasons.${reason}`);

    const renderTableLink = (tableName: string, className?: string) => {
        const href = buildObjectHref(tableName);
        if (!href) {
            return <OverflowTooltip text={tableName} className={cn('block max-w-full truncate', className)} />;
        }

        return (
            <Link href={href} className="inline-block max-w-full align-top">
                <OverflowTooltip text={tableName} className={cn('block max-w-full truncate underline-offset-4 hover:underline', className)} />
            </Link>
        );
    };

    const renderRecommendationList = (items: DatabaseSummaryRecommendation[], emptyLabel: string) => {
        if (!items.length) {
            return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
        }

        return (
            <div className="space-y-3">
                {items.map(item => (
                    <div key={item.name} className="rounded-xl bg-background/70 p-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 max-w-full text-sm font-medium">{renderTableLink(item.name)}</div>
                            {buildObjectHref(item.name) ? (
                                <Button size="sm" variant="outline" asChild className="shrink-0">
                                    <Link href={buildObjectHref(item.name) ?? '#'}>{tCatalog('Open')}</Link>
                                </Button>
                            ) : null}
                        </div>
                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                            <div className="max-w-full">{reasonLabel(item.reason)}</div>
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                                <span>
                                    {t('Size')} {renderNullableNumber(item.bytes, formatBytes, nullTooltip)}
                                </span>
                                <span>
                                    {t('Rows')} {renderNullableNumber(item.rowsEstimate, formatNumber, nullTooltip)}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderTableStatsList = (items: DatabaseSummaryTable[], emptyLabel: string) => {
        if (!items.length) {
            return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
        }

        return (
            <div className="space-y-3">
                {items.map(item => (
                    <div key={item.name} className="rounded-xl bg-background/70 p-3">
                        <div className="max-w-full text-sm font-medium">{renderTableLink(item.name)}</div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>
                                {t('Size')} {renderNullableNumber(item.bytes, formatBytes, nullTooltip)}
                            </span>
                            <span>
                                {t('Rows')} {renderNullableNumber(item.rowsEstimate, formatNumber, nullTooltip)}
                            </span>
                        </div>
                        {item.comment ? <OverflowTooltip text={item.comment} className="mt-1 block max-w-full truncate text-xs text-muted-foreground" /> : null}
                    </div>
                ))}
            </div>
        );
    };

    const quickActions = [
        {
            label: t('Quick Action Browse tables'),
            href: buildListHref('tables'),
        },
        {
            label: t('Quick Action Browse views'),
            href: buildListHref('views'),
        },
        {
            label: t('Quick Action Browse functions'),
            href: buildListHref('functions'),
        },
        {
            label: t('Quick Action Browse sequences'),
            href: buildListHref('sequences'),
        },
    ];

    if (error && !loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{summaryTitle}</CardTitle>
                    <CardDescription>{t('Summary unavailable description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Alert variant="destructive">
                        <AlertTitle>{t('Failed to load summary')}</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                </CardContent>
            </Card>
        );
    }

    return (
        <TooltipProvider delayDuration={200}>
            <div className="space-y-6">
                {/* <div className="space-y-1.5 px-1">
                    <h1 className="text-3xl font-semibold tracking-tight">{summaryTitle}</h1>
                    <p className="text-base text-muted-foreground">{summaryDescription}</p>
                </div> */}

                <SectionCard title={t('Overview')} description={t('Overview description')}>
                    {loading ? (
                        <div className="space-y-5 rounded-2xl bg-muted/35 p-6">
                            <div className="space-y-2">
                                <Skeleton className="h-9 w-48" />
                                <Skeleton className="h-5 w-36" />
                            </div>
                            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                                {Array.from({ length: 4 }).map((_, index) => (
                                    <div key={index} className="space-y-2">
                                        <Skeleton className="h-9 w-20" />
                                        <Skeleton className="h-4 w-24" />
                                    </div>
                                ))}
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                {Array.from({ length: 4 }).map((_, index) => (
                                    <Skeleton key={index} className="h-5 w-full" />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-2xl bg-muted/35 p-6">
                            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                                <div className="space-y-2">
                                    <div className="max-w-full text-3xl font-semibold tracking-tight sm:text-4xl">{renderNullableOverflowText(primaryTitle, nullTooltip)}</div>
                                    <p className="text-sm text-muted-foreground">{primaryCaption}</p>
                                </div>
                                <div className="grid w-full gap-6 sm:grid-cols-2 xl:max-w-3xl xl:grid-cols-4">
                                    <OverviewStat label={t('Tables')} value={formatMetricValue(summary?.tablesCount, formatNumber)} />
                                    <OverviewStat label={t('Views')} value={formatMetricValue(summary?.viewsCount, formatNumber)} />
                                    <OverviewStat label={t('Functions')} value={formatMetricValue(summary?.functionsCount, formatNumber)} />
                                    <OverviewStat label={t('Total Size')} value={formatMetricValue(summary?.totalBytes, formatBytes)} />
                                </div>
                            </div>

                            {overviewMetaItems.length ? (
                                <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-t border-border/60 pt-4">
                                    {overviewMetaItems.map(item => (
                                        <CompactLine key={item.key} label={item.label} value={item.value} />
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    )}
                </SectionCard>

                <SectionCard title={t('Insights')} description={t('Insights description')}>
                    {loading ? (
                        <div className="grid gap-4 xl:grid-cols-3">
                            <Skeleton className="h-44 rounded-2xl" />
                            <Skeleton className="h-44 rounded-2xl" />
                            <Skeleton className="h-44 rounded-2xl" />
                        </div>
                    ) : (
                        <div className="grid gap-4 xl:grid-cols-3">
                            <InsightPanel title={t('Object mix')} headline={objectMixHeadline}>
                                <div>{objectMixSupport}</div>
                                <div>{summary?.oneLineSummary ?? t('Object mix note')}</div>
                            </InsightPanel>

                            <InsightPanel title={t('Table scale')} headline={scaleHeadline}>
                                <div>{scaleSupport.counts}</div>
                                <div>{scaleSupport.note}</div>
                            </InsightPanel>

                            <InsightPanel title={t('Column shape')} headline={columnHeadline}>
                                <div>
                                    {t('Max columns insight', {
                                        value: formatMetricValue(summary?.columnComplexity?.maxColumns, formatNumber),
                                    })}
                                </div>
                                <div>
                                    {t('Widest insight', {
                                        table: summary?.columnComplexity?.maxColumnsTable ?? '—',
                                    })}
                                </div>
                            </InsightPanel>
                        </div>
                    )}
                </SectionCard>

                <SectionCard title={t('Quick access')} description={t('Quick access description')}>
                    {loading ? (
                        <div className="grid gap-4 xl:items-start xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
                            <Skeleton className="h-56 rounded-2xl" />
                            <Skeleton className="h-56 rounded-2xl" />
                        </div>
                    ) : (
                        <div className="grid gap-4 xl:items-start xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
                            <div className="rounded-2xl bg-muted/35 p-5 xl:max-w-sm xl:self-start">
                                <div className="space-y-1">
                                    <div className="text-sm font-medium">{t('Quick Actions')}</div>
                                    <p className="text-sm text-muted-foreground">{t('Quick Actions description')}</p>
                                </div>
                                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                                    {quickActions.map(action =>
                                        action.href ? (
                                            <QuickActionTile key={action.label} href={action.href} label={action.label} />
                                        ) : (
                                            <div key={action.label} className="rounded-xl border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground">
                                                {action.label}
                                            </div>
                                        ),
                                    )}
                                </div>
                            </div>

                            <div className="grid gap-4 xl:grid-cols-2">
                                <div className="rounded-2xl bg-muted/35 p-5">
                                    <div className="space-y-1">
                                        <div className="text-sm font-medium">{t('Start Here')}</div>
                                        <p className="text-sm text-muted-foreground">{t('Start Here description')}</p>
                                    </div>
                                    <div className="mt-4">{renderRecommendationList(summary?.startHere ?? [], emptyTables ? t('No tables found') : t('No recommendations'))}</div>
                                </div>

                                <div className="rounded-2xl bg-muted/35 p-5">
                                    <div className="space-y-1">
                                        <div className="text-sm font-medium">{t('Largest Tables')}</div>
                                        <p className="text-sm text-muted-foreground">{t('Largest Tables description')}</p>
                                    </div>
                                    <div className="mt-4 space-y-4">
                                        {renderTableStatsList(summary?.topTablesByBytes ?? [], t('No tables found'))}

                                        {summary?.recentTables?.length ? (
                                            <div className="space-y-3 border-t border-border/60 pt-4">
                                                <div className="text-sm font-medium">{t('Recently Updated')}</div>
                                                {summary.recentTables.slice(0, 3).map(item => (
                                                    <div key={item.name} className="rounded-xl bg-background/70 p-3">
                                                        <div className="max-w-full text-sm font-medium">{renderTableLink(item.name)}</div>
                                                        <div className="mt-1 text-xs text-muted-foreground">
                                                            {t('Updated')} {renderNullableText(formatTimestamp(item.lastUpdatedAt, locale), nullTooltip)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </SectionCard>
            </div>
        </TooltipProvider>
    );
}
