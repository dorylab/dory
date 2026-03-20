'use client';

import { useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAtomValue } from 'jotai';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';
import { Alert, AlertDescription } from '@/registry/new-york-v4/ui/alert';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { authFetch } from '@/lib/client/auth-fetch';
import { useTranslations } from 'next-intl';
import type { TableProperties } from '../structure/properties-section';
import { OverviewHeader } from './components/overview-header';
import { SummaryCard } from './components/summary-card';
import { HighlightsSection } from './components/highlights-section';
import { SchemaOverviewSection } from './components/schema-overview-section';
import { SemanticLayerSection } from './components/semantic-layer-section';
import { SnippetsSection } from './components/snippets-section';
import type { AiOverview, SemanticGroups } from './types';
import type { ColumnInfo } from '../../type';
import {
    tableQueryKeys,
    useTableColumnsQuery,
    useTablePropertiesQuery,
    useTableStatsQuery,
} from '../table-queries';
import { translate } from '@/lib/i18n/i18n';
import { routing } from '@/lib/i18n/routing';

type TableOverviewProps = {
    databaseName?: string;
    tableName?: string;
};

type AiOverviewResponse = Partial<AiOverview>;

const SEMANTIC_MATCHER_KEYS = {
    keys: ['PrimaryKey', 'Identifier', 'Key'],
    time: ['Time', 'Date', 'Timestamp'],
    geo: ['Geo', 'Address'],
    metrics: ['Metric', 'Amount', 'Measure', 'Numeric'],
    dimensions: ['Dimension', 'Category', 'Status', 'Label', 'Name'],
} as const;

function buildSemanticMatchers() {
    const matchers = {
        keys: [] as string[],
        time: [] as string[],
        geo: [] as string[],
        metrics: [] as string[],
        dimensions: [] as string[],
    };
    const locales = routing.locales;
    (Object.keys(SEMANTIC_MATCHER_KEYS) as Array<keyof typeof SEMANTIC_MATCHER_KEYS>).forEach(group => {
        SEMANTIC_MATCHER_KEYS[group].forEach(key => {
            locales.forEach(locale => {
                const value = translate(locale, `TableBrowser.SemanticMatchers.${key}`).toLowerCase();
                if (value && !matchers[group].includes(value)) {
                    matchers[group].push(value);
                }
            });
        });
    });
    return matchers;
}

const SEMANTIC_MATCHERS = buildSemanticMatchers();

function buildSemanticGroups(columns: ColumnInfo[]): SemanticGroups {
    const groups: SemanticGroups = {
        metrics: [],
        dimensions: [],
        geo: [],
        keys: [],
        time: [],
    };

    columns.forEach(col => {
        const name = col.name;
        const lower = name.toLowerCase();
        const tags = (col.semanticTags || []).map(t => t.toLowerCase());

        const push = (key: keyof SemanticGroups) => {
            if (!groups[key].includes(name)) {
                groups[key].push(name);
            }
        };

        if (
            tags.some(t => SEMANTIC_MATCHERS.keys.some(matcher => t.includes(matcher))) ||
            lower.endsWith('_id') ||
            lower === 'id'
        ) {
            push('keys');
        }

        if (
            tags.some(t => SEMANTIC_MATCHERS.time.some(matcher => t.includes(matcher))) ||
            /time|date|ts/.test(lower)
        ) {
            push('time');
        }

        if (
            tags.some(t => SEMANTIC_MATCHERS.geo.some(matcher => t.includes(matcher))) ||
            /(lon|lng|lat)/.test(lower)
        ) {
            push('geo');
        }

        if (
            tags.some(t => SEMANTIC_MATCHERS.metrics.some(matcher => t.includes(matcher))) ||
            (col.type || '').toLowerCase().match(/(int|float|decimal|double)/)
        ) {
            push('metrics');
        }

        if (
            tags.some(t => SEMANTIC_MATCHERS.dimensions.some(matcher => t.includes(matcher))) ||
            (!groups.metrics.includes(name) && !groups.keys.includes(name) && !groups.time.includes(name))
        ) {
            push('dimensions');
        }
    });

    return groups;
}

function buildFallbackOverview(
    t: ReturnType<typeof useTranslations>,
    {
    databaseName,
    tableName,
    columns,
    properties,
}: {
        databaseName?: string;
        tableName?: string;
        columns: ColumnInfo[];
        properties: TableProperties | null;
    },
): AiOverview {
    const colCount = columns.length;
    const summaryParts = [
        t('Fallback summary', {
            table: tableName ?? t('Fallback current table'),
            count: colCount ? String(colCount) : t('Fallback unknown count'),
        }),
    ];
    if (properties?.engine) summaryParts.push(t('Fallback engine', { engine: properties.engine }));
    if (properties?.partitionKey) summaryParts.push(t('Fallback partition', { partition: properties.partitionKey }));

    const summary = summaryParts.join(t('Fallback summary separator'));
    const detail = t('Fallback detail', { summary });
    const highlights =
        columns.slice(0, 4).map(col => ({
            field: col.name,
            description:
                col.comment?.slice(0, 120) ||
                t('Fallback column description', {
                    name: col.name,
                    type: col.type || t('Fallback unknown type'),
                    required: col.nullable === false ? t('Fallback required') : '',
                }),
        })) || [];
    const snippets =
        tableName && columns.length
            ? [
                  {
                      title: t('Fallback snippet title'),
                      sql: `SELECT *\nFROM ${tableName}\nLIMIT 50;`,
                  },
              ]
            : [];
    return {
        summary,
        detail,
        highlights,
        snippets,
    };
}

export function TableOverview({ databaseName, tableName }: TableOverviewProps) {
    const currentConnection = useAtomValue(currentConnectionAtom);
    const connectionId = currentConnection?.connection.id as string | undefined;
    const t = useTranslations('TableBrowser');

    const columnsQuery = useTableColumnsQuery({
        databaseName,
        tableName,
        connectionId,
        dbType: currentConnection?.connection.type,
    });
    const propertiesQuery = useTablePropertiesQuery({ databaseName, tableName, connectionId });
    const statsQuery = useTableStatsQuery({ databaseName, tableName, connectionId });

    const columns = columnsQuery.data?.columns ?? [];
    const properties = propertiesQuery.data ?? null;
    const stats = statsQuery.data ?? null;

    const loadingColumns = columnsQuery.isLoading;
    const loadingColumnTags = columnsQuery.isFetching && !columnsQuery.isLoading;
    const loadingProperties = propertiesQuery.isLoading;
    const loadingStats = statsQuery.isLoading;

    const aiBlocked = loadingColumns || loadingColumnTags || loadingProperties || !columns.length;

    const fallbackOverview = useMemo(
        () =>
            buildFallbackOverview(t, {
                databaseName,
                tableName,
                columns,
                properties,
            }),
        [columns, databaseName, properties, t, tableName],
    );

    const ignoreAiCacheRef = useRef(false);

    const aiOverviewQuery = useQuery({
        queryKey: tableQueryKeys.aiOverview(connectionId, databaseName, tableName),
        enabled: Boolean(connectionId && databaseName && tableName && !aiBlocked && columns.length),
        staleTime: 1000 * 60 * 10,
        gcTime: 1000 * 60 * 30,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            const ignoreCache = ignoreAiCacheRef.current;
            ignoreAiCacheRef.current = false;

            const res = await authFetch('/api/ai/table-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    database: databaseName,
                    table: tableName,
                    columns,
                    properties,
                    connectionId: currentConnection?.connection.id,
                    dbType: currentConnection?.connection.type,
                    ignoreCache,
                }),
            });

            if (!res.ok) {
                throw new Error(await res.text());
            }

            const data = (await res.json()) as AiOverviewResponse;
            console.log('AI Overview response:', data);
            
            return {
                summary: (data.summary || fallbackOverview.summary).trim(),
                detail: (data.detail || fallbackOverview.detail).trim(),
                highlights: (data.highlights || fallbackOverview.highlights || [])
                    .filter(item => item?.field && item?.description)
                    .slice(0, 6),
                snippets: (data.snippets || fallbackOverview.snippets || [])
                    .filter(item => item?.sql)
                    .slice(0, 5),
            } as AiOverview;
        },
    });

    const aiOverview = aiOverviewQuery.data ?? (!aiBlocked ? fallbackOverview : null);
    const aiError = aiOverviewQuery.error ? (aiOverviewQuery.error as Error).message : null;
    const aiLoading = aiOverviewQuery.isFetching;
    const aiUpdatedAt = aiOverviewQuery.dataUpdatedAt ? new Date(aiOverviewQuery.dataUpdatedAt) : null;

    const semanticGroups = useMemo(() => buildSemanticGroups(columns), [columns]);
    const loadingAny = loadingColumns || loadingColumnTags || loadingProperties;
    const overviewLoading = aiLoading || aiBlocked || !aiOverview;
    const highlights = aiOverview?.highlights ?? [];
    const snippets = aiOverview?.snippets ?? [];

    if (!databaseName || !tableName) {
        return (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                {t('Select table to view overview')}
            </div>
        );
    }

    return (
        <ScrollArea className="h-full pr-3">
            <div className="space-y-5 pb-6">
                <OverviewHeader
                    loading={aiLoading}
                    blocked={aiBlocked}
                    updatedAt={aiUpdatedAt}
                    onRefresh={() => {
                        if (!aiBlocked) {
                            ignoreAiCacheRef.current = true;
                            void aiOverviewQuery.refetch();
                        }
                    }}
                />

                {aiError ? (
                    <Alert variant="destructive">
                        <AlertDescription>{aiError}</AlertDescription>
                    </Alert>
                ) : null}

                <SummaryCard summary={aiOverview?.summary} detail={aiOverview?.detail} loading={overviewLoading} />

                <HighlightsSection highlights={highlights} loading={overviewLoading} />

                <SchemaOverviewSection
                    columnCount={columns.length}
                    properties={properties}
                    stats={stats}
                    loadingStructure={loadingAny}
                    loadingProperties={loadingProperties}
                    loadingStats={loadingStats}
                />

                <SemanticLayerSection groups={semanticGroups} loading={loadingAny} />

                <SnippetsSection snippets={snippets} loading={overviewLoading} />
            </div>
        </ScrollArea>
    );
}
