'use client';

import { useTranslations } from 'next-intl';
import DatabaseSummary from '@/components/explorer/resources/database/components/database-summary';
import type { ExplorerBaseParams, ExplorerListKind, ExplorerResource } from '@/lib/explorer/types';
import { FunctionListResourceTab } from '@/components/explorer/resources/function/tabs/function-list-tab';
import { ObjectListTab } from '@/components/explorer/resources/schema/tabs/object-list-tab';
import { ExplorerTabsShell, type ExplorerTab } from '@/components/explorer/resources/shared/components/explorer-tabs-shell';
import { SchemaGraphTab } from '@/components/explorer/resources/schema-graph/schema-graph-tab';

type SchemaTab = 'summary' | 'graph' | 'tables' | 'views' | 'functions' | 'sequences';

type SchemaViewProps = {
    baseParams: ExplorerBaseParams;
    catalog: string;
    resource: Extract<ExplorerResource, { kind: 'schema' | 'list' }>;
};

function resolveInitialTab(resource: Extract<ExplorerResource, { kind: 'schema' | 'list' }>): SchemaTab {
    if (resource.kind !== 'list') {
        return 'summary';
    }

    const map: Partial<Record<ExplorerListKind, SchemaTab>> = {
        tables: 'tables',
        views: 'views',
        materializedViews: 'views',
        functions: 'functions',
        sequences: 'sequences',
    };

    return map[resource.listKind] ?? 'summary';
}

export function SchemaResourceView({ baseParams, catalog, resource }: SchemaViewProps) {
    const t = useTranslations('PostgresExplorer');
    const schemaName = resource.schema;
    const initialTab = resolveInitialTab(resource);
    const tabs: ExplorerTab<SchemaTab>[] = [
        {
            value: 'summary',
            label: t('Tabs.summary'),
            content: <DatabaseSummary baseParams={baseParams} catalog={catalog} database={resource.database} schema={schemaName} />,
        },
        {
            value: 'graph',
            label: t('Tabs.graph'),
            content: <SchemaGraphTab baseParams={baseParams} database={resource.database} schema={schemaName} />,
            lazy: true,
        },
        {
            value: 'tables',
            label: t('Tabs.tables'),
            content: (
                <ObjectListTab
                    baseParams={baseParams}
                    database={resource.database}
                    schema={schemaName}
                    endpoint="tables"
                    objectKind="table"
                    searchPlaceholder={t('Tables.SearchPlaceholder')}
                    emptyText={t('Tables.Empty')}
                    filteredEmptyText={t('Tables.FilteredEmpty')}
                />
            ),
        },
        {
            value: 'views',
            label: t('Tabs.views'),
            content: (
                <ObjectListTab
                    baseParams={baseParams}
                    database={resource.database}
                    schema={schemaName}
                    endpoint="views"
                    objectKind="view"
                    searchPlaceholder={t('Views.SearchPlaceholder')}
                    emptyText={t('Views.Empty')}
                    filteredEmptyText={t('Views.FilteredEmpty')}
                />
            ),
        },
        {
            value: 'functions',
            label: t('Tabs.functions'),
            content: (
                <FunctionListResourceTab
                    baseParams={baseParams}
                    database={resource.database}
                    schema={schemaName}
                    searchPlaceholder={t('Functions.SearchPlaceholder')}
                    emptyText={t('Functions.Empty')}
                    filteredEmptyText={t('Functions.FilteredEmpty')}
                />
            ),
        },
        {
            value: 'sequences',
            label: t('Tabs.sequences'),
            content: (
                <ObjectListTab
                    baseParams={baseParams}
                    database={resource.database}
                    schema={schemaName}
                    endpoint="sequences"
                    objectKind="sequence"
                    searchPlaceholder={t('Sequences.SearchPlaceholder')}
                    emptyText={t('Sequences.Empty')}
                    filteredEmptyText={t('Sequences.FilteredEmpty')}
                />
            ),
        },
    ];

    return <ExplorerTabsShell initialTab={initialTab} tabs={tabs} resetKey={`${resource.database}:${schemaName}:${resource.kind === 'list' ? resource.listKind : 'summary'}`} />;
}
