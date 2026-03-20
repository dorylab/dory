'use client';

import UrlTableBrowser from '@/app/(app)/[organization]/components/table-browser/url-table-browser';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { formatObjectKindLabel } from '@/lib/explorer/routing';
import type { ExplorerResource } from '@/lib/explorer/types';

type ObjectViewProps = {
    catalog: string;
    resource: Extract<ExplorerResource, { kind: 'object' }>;
};

export function ObjectView({ catalog, resource }: ObjectViewProps) {
    if (resource.objectKind === 'table' || resource.objectKind === 'view' || resource.objectKind === 'materializedView') {
        const tableName = resource.schema ? `${resource.schema}.${resource.name}` : resource.name;

        return <UrlTableBrowser catalog={catalog} databaseName={resource.database} tableName={tableName} />;
    }

    return (
        <div className="p-6">
            <Card>
                <CardHeader>
                    <CardTitle>{resource.name}</CardTitle>
                    <CardDescription>{formatObjectKindLabel(resource.objectKind)}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">This object kind does not have a dedicated explorer view yet.</CardContent>
            </Card>
        </div>
    );
}
