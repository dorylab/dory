'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { buildExplorerListPath } from '@/lib/explorer/build-path';
import { formatListKindLabel } from '@/lib/explorer/routing';
import type { ExplorerBaseParams, ExplorerListKind, ExplorerResource } from '@/lib/explorer/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import { SchemaGraphTab } from '@/components/explorer/resources/schema-graph/schema-graph-tab';

type FallbackSchemaViewProps = {
    baseParams: ExplorerBaseParams;
    resource: Extract<ExplorerResource, { kind: 'schema' | 'list' }>;
};

const SCHEMA_LISTS: ExplorerListKind[] = ['tables', 'views', 'materializedViews', 'functions', 'sequences'];

export function FallbackSchemaView({ baseParams, resource }: FallbackSchemaViewProps) {
    const t = useTranslations('SchemaGraph');
    const activeList = resource.kind === 'list' ? resource.listKind : null;
    const schemaName = resource.schema;
    const [tab, setTab] = useQueryState('tab', parseAsStringLiteral(['objects', 'graph'] as const).withDefault('objects'));

    return (
        <div className="flex h-full flex-col gap-3 px-6 pb-6 pt-3">
            <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold">{schemaName}</h1>
                {activeList ? <Badge variant="outline">{formatListKindLabel(activeList)}</Badge> : null}
            </div>

            <Tabs value={tab} onValueChange={value => void setTab(value as 'objects' | 'graph')} className="flex min-h-0 flex-1 flex-col">
                <TabsList className="w-fit">
                    <TabsTrigger value="objects">{t('Objects')}</TabsTrigger>
                    <TabsTrigger value="graph">{t('Graph')}</TabsTrigger>
                </TabsList>
                <TabsContent value="objects" className="mt-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Schema explorer</CardTitle>
                            <CardDescription>Use explicit schema routes for schema-scoped lists, and keep object selection aligned with driver capabilities.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {SCHEMA_LISTS.map(listKind => (
                                <Link
                                    key={listKind}
                                    href={buildExplorerListPath(baseParams, {
                                        database: resource.database,
                                        schema: schemaName,
                                        listKind,
                                    })}
                                    className="block"
                                >
                                    <div className="rounded-lg border p-4 transition-colors hover:bg-muted/40">
                                        <div className="text-sm font-medium">{formatListKindLabel(listKind)}</div>
                                        <div className="mt-1 text-xs text-muted-foreground">Open {formatListKindLabel(listKind).toLowerCase()} within this schema.</div>
                                    </div>
                                </Link>
                            ))}
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="graph" className="mt-0 min-h-0 flex-1">
                    <SchemaGraphTab baseParams={baseParams} database={resource.database} schema={schemaName} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
