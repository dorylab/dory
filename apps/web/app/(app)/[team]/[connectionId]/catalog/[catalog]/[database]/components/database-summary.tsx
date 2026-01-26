'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAtomValue } from 'jotai';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/registry/new-york-v4/ui/alert';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/registry/new-york-v4/ui/tooltip';
import type { ResponseObject } from '@/types';
import { authFetch } from '@/lib/client/auth-fetch';
import { isSuccess } from '@/lib/result';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { cn } from '@/lib/utils';
import { formatBytes, formatNumber } from '@/app/(app)/[team]/components/table-browser/components/stats/components/formatters';
import { useLocale, useTranslations } from 'next-intl';

type DatabaseSummaryProps = {
    catalog?: string | null;
    database?: string | null;
    schema?: string | null;
};

type DatabaseSummaryTable = {
    name: string;
    bytes: number | null;
    rowsEstimate: number | null;
    comment: string | null;
};

type DatabaseRecentTable = {
    name: string;
    lastUpdatedAt: string | null;
};

type DatabaseSummary = {
    databaseName: string;
    catalogName: string | null;
    schemaName: string | null;
    engine: 'clickhouse' | 'doris' | 'mysql' | 'unknown';
    cluster: string | null;
    tablesCount: number | null;
    viewsCount: number | null;
    materializedViewsCount: number | null;
    totalBytes: number | null;
    totalRowsEstimate: number | null;
    lastUpdatedAt: string | null;
    lastQueriedAt: string | null;
    topTablesByBytes: DatabaseSummaryTable[];
    topTablesByRows: DatabaseSummaryTable[];
    recentTables: DatabaseRecentTable[];
    oneLineSummary: string | null;
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

function renderNullableNumber(
    value: number | null | undefined,
    formatter: (value: number) => string,
    tooltip: string,
    className?: string,
) {
    if (value === null || value === undefined) return <NullValue className={className} tooltip={tooltip} />;
    return <span className={className}>{formatter(value)}</span>;
}

function SummaryField({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="space-y-1">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-sm font-medium leading-tight">{value}</div>
        </div>
    );
}

export default function DatabaseSummary({ catalog, database, schema }: DatabaseSummaryProps) {
    const params = useParams<{ team?: string | string[]; connectionId?: string | string[]; catalog?: string | string[]; database?: string | string[] }>();
    const currentConnection = useAtomValue(currentConnectionAtom);
    const t = useTranslations('CatalogSummary');
    const locale = useLocale();
    const [summary, setSummary] = useState<DatabaseSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [draft, setDraft] = useState('');

    const databaseName = decodeParam(database ?? resolveParam(params?.database) ?? '') ?? '';
    const catalogName = decodeParam(catalog ?? resolveParam(params?.catalog) ?? null) ?? null;
    const teamId = resolveParam(params?.team);
    const connectionId = resolveParam(params?.connectionId) ?? currentConnection?.connection.id;
    const nullTooltip = t('Null tooltip');
    const defaultSummaryPlaceholder = t('Summary placeholder');
    const engineLabels: Record<DatabaseSummary['engine'], string> = {
        clickhouse: 'ClickHouse',
        doris: 'Doris',
        mysql: 'MySQL',
        unknown: t('Unknown engine'),
    };

    const tableHrefBase = useMemo(() => {
        if (!teamId || !connectionId || !catalogName || !databaseName) return null;
        return `/${teamId}/${connectionId}/catalog/${catalogName}/${databaseName}`;
    }, [catalogName, connectionId, databaseName, teamId]);

    const renderQuickStartItem = useCallback(
        (
            item: DatabaseSummary['topTablesByBytes'][number] | DatabaseSummary['recentTables'][number],
            isRecent?: boolean,
        ) => {
            const href = tableHrefBase ? `${tableHrefBase}/${encodeURIComponent(item.name)}` : null;

            if (isRecent) {
                const recentItem = item as DatabaseSummary['recentTables'][number];
                return (
                    <div key={recentItem.name} className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                            <div className="text-sm font-medium text-foreground">{recentItem.name}</div>
                            <div className="text-xs text-muted-foreground">
                                {t('Updated')}{' '}
                                {renderNullableText(formatTimestamp(recentItem.lastUpdatedAt ?? null, locale), nullTooltip)}
                            </div>
                        </div>
                        {href ? (
                            <Button size="sm" variant="outline" asChild>
                                <Link href={href}>{t('Open table')}</Link>
                            </Button>
                        ) : (
                            <Button size="sm" variant="outline" disabled>
                                {t('Open table')}
                            </Button>
                        )}
                    </div>
                );
            }

            const tableItem = item as DatabaseSummary['topTablesByBytes'][number];
            return (
                <div key={tableItem.name} className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                        <div className="text-sm font-medium text-foreground">{tableItem.name}</div>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                            <span>
                                {t('Size')}{' '}
                                {renderNullableNumber(tableItem.bytes ?? null, formatBytes, nullTooltip)}
                            </span>
                            <span>
                                {t('Rows')}{' '}
                                {renderNullableNumber(tableItem.rowsEstimate ?? null, formatNumber, nullTooltip)}
                            </span>
                            {tableItem.comment ? <span className="text-muted-foreground">{tableItem.comment}</span> : null}
                        </div>
                    </div>
                    {href ? (
                        <Button size="sm" variant="outline" asChild>
                            <Link href={href}>{t('Open table')}</Link>
                        </Button>
                    ) : (
                        <Button size="sm" variant="outline" disabled>
                            {t('Open table')}
                        </Button>
                    )}
                </div>
            );
        },
        [locale, nullTooltip, t, tableHrefBase],
    );

    const loadSummary = useCallback(async () => {
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
            const res = (await response.json()) as ResponseObject<DatabaseSummary>;

            if (!isSuccess(res)) {
                throw new Error(res.message || t('Failed to fetch summary'));
            }

            setSummary(res.data ?? null);
            setDraft(res.data?.oneLineSummary ?? '');
        } catch (err) {
            console.error('Failed to fetch database summary:', err);
            setSummary(null);
            setError(t('Summary unavailable'));
        } finally {
            setLoading(false);
        }
    }, [catalogName, connectionId, databaseName, schema, t]);

    useEffect(() => {
        loadSummary();
    }, [loadSummary]);

    useEffect(() => {
        setIsEditing(false);
    }, [databaseName, catalogName]);

    const handleSave = async () => {
        if (!databaseName || !connectionId) return;
        const nextSummary = draft.trim();
        setIsSaving(true);
        try {
            const encodedDb = encodeURIComponent(databaseName);
            const response = await authFetch(`/api/databases/${encodedDb}/summary-note`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Connection-ID': connectionId,
                },
                body: JSON.stringify({ oneLineSummary: nextSummary.length ? nextSummary : null }),
            });
            const res = (await response.json()) as ResponseObject<{ oneLineSummary: string | null }>;

            if (!isSuccess(res)) {
                throw new Error(res.message || t('Failed to save summary'));
            }

            setSummary(prev => (prev ? { ...prev, oneLineSummary: res.data?.oneLineSummary ?? null } : prev));
            setIsEditing(false);
        } catch (err) {
            console.error('Failed to save summary note:', err);
            setError(t('Failed to save summary note'));
        } finally {
            setIsSaving(false);
        }
    };

    const emptyTables = useMemo(() => summary?.tablesCount === 0, [summary]);

    if (error && !loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{t('Database Summary')}</CardTitle>
                    <CardDescription>{t('Summary unavailable description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Alert variant="destructive">
                        <AlertTitle>{t('Failed to load summary')}</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                    <Button onClick={loadSummary}>{t('Retry')}</Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <TooltipProvider delayDuration={200}>
            <div className="space-y-6">
                <Card>
                    <CardHeader className="space-y-1.5">
                        <CardTitle>{t('Database Summary')}</CardTitle>
                        <CardDescription>{t('Database summary description')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {loading ? (
                            <div className="grid gap-4 lg:grid-cols-2">
                                <Skeleton className="h-36" />
                                <Skeleton className="h-36" />
                            </div>
                        ) : (
                            <div className="grid gap-6 lg:grid-cols-2">
                                <div className="space-y-3">
                                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('Identity')}</div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <SummaryField label={t('Database')} value={renderNullableText(summary?.databaseName ?? '', nullTooltip)} />
                                        <SummaryField label={t('Catalog')} value={renderNullableText(summary?.catalogName ?? null, nullTooltip)} />
                                        <SummaryField label={t('Schema')} value={renderNullableText(summary?.schemaName ?? null, nullTooltip)} />
                                        <SummaryField label={t('Engine')} value={renderNullableText(summary ? engineLabels[summary.engine] : null, nullTooltip)} />
                                        <SummaryField label={t('Cluster / Endpoint')} value={renderNullableText(summary?.cluster ?? null, nullTooltip)} />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('Size & Activity')}</div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <SummaryField label={t('Tables')} value={renderNullableNumber(summary?.tablesCount ?? null, formatNumber, nullTooltip)} />
                                        <SummaryField label={t('Views')} value={renderNullableNumber(summary?.viewsCount ?? null, formatNumber, nullTooltip)} />
                                        <SummaryField
                                            label={t('Materialized Views')}
                                            value={renderNullableNumber(summary?.materializedViewsCount ?? null, formatNumber, nullTooltip)}
                                        />
                                        <SummaryField label={t('Total Size')} value={renderNullableNumber(summary?.totalBytes ?? null, formatBytes, nullTooltip)} />
                                        <SummaryField
                                            label={t('Rows (est)')}
                                            value={renderNullableNumber(summary?.totalRowsEstimate ?? null, formatNumber, nullTooltip)}
                                        />
                                        <SummaryField
                                            label={t('Last Updated')}
                                            value={renderNullableText(formatTimestamp(summary?.lastUpdatedAt ?? null, locale), nullTooltip)}
                                        />
                                        <SummaryField
                                            label={t('Last Queried')}
                                            value={renderNullableText(formatTimestamp(summary?.lastQueriedAt ?? null, locale), nullTooltip)}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    {t('One-line summary')}
                                </div>
                                {!loading && !isEditing ? (
                                    <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                                        {t('Edit')}
                                    </Button>
                                ) : null}
                            </div>
                            {loading ? (
                                <Skeleton className="h-20" />
                            ) : isEditing ? (
                                <div className="space-y-2">
                                    <Textarea
                                        value={draft}
                                        onChange={event => setDraft(event.target.value)}
                                        placeholder={defaultSummaryPlaceholder}
                                        rows={3}
                                    />
                                    <div className="flex items-center gap-2">
                                        <Button size="sm" onClick={handleSave} disabled={isSaving}>
                                            {isSaving ? t('Saving') : t('Save')}
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                                            {t('Cancel')}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    {summary?.oneLineSummary?.trim() ? summary.oneLineSummary : defaultSummaryPlaceholder}
                                </p>
                            )}
                        </div> */}
                    </CardContent>
                </Card>

                <div className="grid gap-4 lg:grid-cols-3">
                    {[
                        {
                            title: t('Top by Size'),
                            description: t('Top by Size description'),
                            data: summary?.topTablesByBytes ?? [],
                        },
                        {
                            title: t('Top by Rows'),
                            description: t('Top by Rows description'),
                            data: summary?.topTablesByRows ?? [],
                        },
                        {
                            title: t('Recently Updated'),
                            description: t('Recently Updated description'),
                            data: summary?.recentTables ?? [],
                            isRecent: true,
                        },
                    ].map(section => (
                        <Card key={section.title}>
                            <CardHeader className="space-y-1">
                                <CardTitle className="text-base">{section.title}</CardTitle>
                                <CardDescription>{section.description}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {loading ? (
                                    <div className="space-y-3">
                                        <Skeleton className="h-10" />
                                        <Skeleton className="h-10" />
                                        <Skeleton className="h-10" />
                                    </div>
                                ) : emptyTables ? (
                                    <div className="space-y-3">
                                        <p className="text-sm text-muted-foreground">{t('No tables found')}</p>
                                        {/* <Button size="sm" variant="outline">{t('Create or Import')}</Button> */}
                                    </div>
                                ) : section.data.length ? (
                                    <div className="space-y-3">
                                        {section.data.map(item => renderQuickStartItem(item, section.isRecent))}
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <p className="text-sm text-muted-foreground">{t('No tables found')}</p>
                                        {/* <Button size="sm" variant="outline">{t('Create or Import')}</Button> */}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </TooltipProvider>
    );
}
