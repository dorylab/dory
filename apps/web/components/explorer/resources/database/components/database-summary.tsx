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
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import { authFetch } from '@/lib/client/auth-fetch';
import { isSuccess } from '@/lib/result';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { buildExplorerListPath, buildExplorerObjectPath } from '@/lib/explorer/build-path';
import type { ExplorerBaseParams } from '@/lib/explorer/types';
import { cn } from '@/lib/utils';
import { splitQualifiedName } from '@/components/explorer/core/explorer-store';
import { formatBytes, formatNumber } from '@/app/(app)/[organization]/components/table-browser/components/stats/components/formatters';
import type { DatabaseSummary as DatabaseSummaryData, DatabaseSummaryRecommendation, DatabaseSummaryTable } from '@/lib/connection/base/types';
import type { ResponseObject } from '@/types';

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

function SummaryField({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="min-w-0 rounded-lg border bg-background/60 p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 min-w-0 text-sm font-medium leading-tight">{value}</div>
        </div>
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
    const connectionId = resolveParam(params?.connectionId) ?? currentConnection?.connection.id;
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
                const encodedDb = encodeURIComponent(databaseName);
                const query = new URLSearchParams();
                if (catalogName) query.set('catalog', catalogName);
                if (schema) query.set('schema', schema);
                const url = `/api/connection/${connectionId}/databases/${encodedDb}/summary${query.toString() ? `?${query.toString()}` : ''}`;

                const response = await authFetch(url, {
                    method: 'GET',
                    headers: {
                        'X-Connection-ID': connectionId,
                    },
                });
                const res = (await response.json()) as ResponseObject<DatabaseSummaryData>;

                if (!isSuccess(res)) {
                    throw new Error(res.message || t('Failed to fetch summary'));
                }

                if (!ignore) {
                    setSummary(res.data ?? null);
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
                    <div key={item.name} className="rounded-lg border bg-background/50 p-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                                <div className="max-w-full text-sm font-medium">{renderTableLink(item.name)}</div>
                                <div className="text-xs text-muted-foreground">{reasonLabel(item.reason)}</div>
                                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                    <span>
                                        {t('Size')} {renderNullableNumber(item.bytes, formatBytes, nullTooltip)}
                                    </span>
                                    <span>
                                        {t('Rows')} {renderNullableNumber(item.rowsEstimate, formatNumber, nullTooltip)}
                                    </span>
                                </div>
                            </div>
                            {buildObjectHref(item.name) ? (
                                <Button size="sm" variant="outline" asChild className="shrink-0">
                                    <Link href={buildObjectHref(item.name) ?? '#'}>{tCatalog('Open')}</Link>
                                </Button>
                            ) : null}
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
                    <div key={item.name} className="rounded-lg border bg-background/50 p-3">
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
            label: t('Quick Action Explore largest table'),
            href: summary?.topTablesByBytes[0] ? buildObjectHref(summary.topTablesByBytes[0].name) : null,
        },
        {
            label: t('Quick Action Show recent changes'),
            href: '#recently-updated',
        },
        {
            label: t('Quick Action Analyze relationships'),
            href: '#relationships',
        },
        {
            label: t('Quick Action Browse tables'),
            href: buildListHref('tables'),
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
                <div className="space-y-1.5 px-1">
                    <h1 className="text-3xl font-semibold tracking-tight">{summaryTitle}</h1>
                    <p className="text-base text-muted-foreground">{summaryDescription}</p>
                </div>

                <SectionCard title={t('Identity')} description={t('Identity description')}>
                            {loading ? (
                                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                    {Array.from({ length: 7 }).map((_, index) => (
                                        <Skeleton key={index} className="h-16" />
                                    ))}
                                </div>
                            ) : (
                                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                    <SummaryField label={t('Schema')} value={renderNullableOverflowText(summary?.schemaName ?? schema ?? null, nullTooltip)} />
                                    <SummaryField label={t('Database')} value={renderNullableOverflowText(summary?.databaseName ?? databaseName, nullTooltip)} />
                                    <SummaryField label={t('Tables')} value={renderNullableNumber(summary?.tablesCount, formatNumber, nullTooltip)} />
                                    <SummaryField label={t('Views')} value={renderNullableNumber(summary?.viewsCount, formatNumber, nullTooltip)} />
                                    <SummaryField label={t('Functions')} value={renderNullableNumber(summary?.functionsCount, formatNumber, nullTooltip)} />
                                    <SummaryField label={t('Total Size')} value={renderNullableNumber(summary?.totalBytes, formatBytes, nullTooltip)} />
                                    <SummaryField label={t('Owner')} value={renderNullableOverflowText(summary?.owner ?? null, nullTooltip)} />
                                </div>
                            )}
                </SectionCard>

                <SectionCard title={t('Structure')} description={t('Structure description')}>
                            {loading ? (
                                <div className="grid gap-4 xl:grid-cols-3">
                                    <Skeleton className="h-36" />
                                    <Skeleton className="h-36" />
                                    <Skeleton className="h-36" />
                                </div>
                            ) : (
                                <div className="grid gap-4 xl:grid-cols-3">
                                    <Card>
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-sm">{t('Object Type Distribution')}</CardTitle>
                                        </CardHeader>
                                        <CardContent className="grid gap-3">
                                            <SummaryField label={t('Tables')} value={renderNullableNumber(summary?.tablesCount, formatNumber, nullTooltip)} />
                                            <SummaryField label={t('Views')} value={renderNullableNumber(summary?.viewsCount, formatNumber, nullTooltip)} />
                                            <SummaryField
                                                label={t('Materialized Views')}
                                                value={renderNullableNumber(summary?.materializedViewsCount, formatNumber, nullTooltip)}
                                            />
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-sm">{t('Table Size Distribution')}</CardTitle>
                                        </CardHeader>
                                        <CardContent className="grid gap-3">
                                            <SummaryField
                                                label={t('Small tables')}
                                                value={renderNullableNumber(summary?.tableSizeDistribution.smallTablesCount, formatNumber, nullTooltip)}
                                            />
                                            <SummaryField
                                                label={t('Medium tables')}
                                                value={renderNullableNumber(summary?.tableSizeDistribution.mediumTablesCount, formatNumber, nullTooltip)}
                                            />
                                            <SummaryField
                                                label={t('Large tables')}
                                                value={renderNullableNumber(summary?.tableSizeDistribution.largeTablesCount, formatNumber, nullTooltip)}
                                            />
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-sm">{t('Column Complexity')}</CardTitle>
                                        </CardHeader>
                                        <CardContent className="grid gap-3">
                                            <SummaryField
                                                label={t('Avg columns per table')}
                                                value={renderNullableNumber(summary?.columnComplexity.averageColumnsPerTable, formatDecimal, nullTooltip)}
                                            />
                                            <SummaryField label={t('Max columns')} value={renderNullableNumber(summary?.columnComplexity.maxColumns, formatNumber, nullTooltip)} />
                                            <SummaryField
                                                label={t('Widest table')}
                                                value={renderNullableOverflowText(summary?.columnComplexity.maxColumnsTable ?? null, nullTooltip)}
                                            />
                                        </CardContent>
                                    </Card>
                                </div>
                            )}
                </SectionCard>

                <SectionCard title={t('Highlights')} description={t('Highlights description')}>
                            {loading ? (
                                <div className="grid gap-4 xl:grid-cols-2">
                                    <Skeleton className="h-48" />
                                    <Skeleton className="h-48" />
                                    <Skeleton className="h-48" />
                                    <Skeleton className="h-48" />
                                </div>
                            ) : (
                                <div className="grid gap-4 xl:grid-cols-2">
                                    <Card>
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-sm">{t('Core Tables')}</CardTitle>
                                            <CardDescription>{t('Core Tables description')}</CardDescription>
                                        </CardHeader>
                                        <CardContent>{renderRecommendationList(summary?.coreTables ?? [], t('No tables found'))}</CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-sm">{t('Largest Tables')}</CardTitle>
                                            <CardDescription>{t('Largest Tables description')}</CardDescription>
                                        </CardHeader>
                                        <CardContent>{renderTableStatsList(summary?.topTablesByBytes ?? [], t('No tables found'))}</CardContent>
                                    </Card>

                                    <Card id="recently-updated">
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-sm">{t('Recently Updated')}</CardTitle>
                                            <CardDescription>{t('Recently Updated description')}</CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            {summary?.recentTables?.length ? (
                                                <div className="space-y-3">
                                                    {summary.recentTables.map(item => (
                                                        <div key={item.name} className="rounded-lg border bg-background/50 p-3">
                                                            <div className="max-w-full text-sm font-medium">{renderTableLink(item.name)}</div>
                                                            <div className="mt-1 text-xs text-muted-foreground">
                                                                {t('Updated')} {renderNullableText(formatTimestamp(item.lastUpdatedAt, locale), nullTooltip)}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-muted-foreground">{t('No recent updates found')}</p>
                                            )}
                                        </CardContent>
                                    </Card>

                                    <div className="space-y-4" id="relationships">
                                        <Card>
                                            <CardHeader className="pb-3">
                                                <CardTitle className="text-sm">{t('Relationships')}</CardTitle>
                                                <CardDescription>{t('Relationships description')}</CardDescription>
                                            </CardHeader>
                                            <CardContent className="space-y-3">
                                                <SummaryField
                                                    label={t('Foreign key links')}
                                                    value={renderNullableNumber(summary?.foreignKeyLinksCount, formatNumber, nullTooltip)}
                                                />
                                                {summary?.relationshipPaths?.length ? (
                                                    <div className="space-y-2">
                                                        {summary.relationshipPaths.map(item => (
                                                            <div key={item.path} className="rounded-lg border bg-background/50 px-3 py-2 text-sm">
                                                                {item.path}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-muted-foreground">{t('No relationships found')}</p>
                                                )}
                                            </CardContent>
                                        </Card>

                                        <Card>
                                            <CardHeader className="pb-3">
                                                <CardTitle className="text-sm">{t('Detected Patterns')}</CardTitle>
                                                <CardDescription>{t('Detected Patterns description')}</CardDescription>
                                            </CardHeader>
                                            <CardContent>
                                                {summary?.detectedPatterns?.length ? (
                                                    <div className="flex flex-wrap gap-2">
                                                        {summary.detectedPatterns.map(item => (
                                                            <Badge key={`${item.kind}-${item.label}`} variant="secondary">
                                                                {item.label}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-muted-foreground">{t('No patterns detected')}</p>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </div>
                                </div>
                            )}
                </SectionCard>

                <SectionCard title={t('Entry Points')} description={t('Entry Points description')}>
                            {loading ? (
                                <div className="grid gap-4 xl:grid-cols-2">
                                    <Skeleton className="h-40" />
                                    <Skeleton className="h-40" />
                                </div>
                            ) : (
                                <div className="grid gap-4 xl:grid-cols-2">
                                    <Card>
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-sm">{t('Quick Actions')}</CardTitle>
                                            <CardDescription>{t('Quick Actions description')}</CardDescription>
                                        </CardHeader>
                                        <CardContent className="grid gap-3">
                                            {quickActions.map(action =>
                                                action.href ? (
                                                    <Button key={action.label} variant="outline" asChild className="justify-start">
                                                        <Link href={action.href}>{action.label}</Link>
                                                    </Button>
                                                ) : (
                                                    <Button key={action.label} variant="outline" disabled className="justify-start">
                                                        {action.label}
                                                    </Button>
                                                ),
                                            )}
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-sm">{t('Start Here')}</CardTitle>
                                            <CardDescription>{t('Start Here description')}</CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            {renderRecommendationList(summary?.startHere ?? [], emptyTables ? t('No tables found') : t('No recommendations'))}
                                        </CardContent>
                                    </Card>
                                </div>
                            )}
                </SectionCard>
            </div>
        </TooltipProvider>
    );
}
