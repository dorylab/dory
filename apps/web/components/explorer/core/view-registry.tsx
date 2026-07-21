'use client';

import type { ExplorerResolvedRoute } from '@/lib/explorer/types';
import { getExplorerDriver } from '@/components/explorer/drivers';
import type { ExplorerViewRegistry } from './explorer-types';
import { TableResourceView } from '../resources/table/views/table-view';
import { FallbackDatabaseView } from '../resources/database/views/fallback-database-view';
import { ObjectView } from '../resources/table/views/object-view';
import { FallbackSchemaView } from '../resources/schema/views/fallback-schema-view';

const DEFAULT_VIEW_REGISTRY: ExplorerViewRegistry = {
    namespace: ({ baseParams, catalog, resource }) => <FallbackDatabaseView baseParams={baseParams} catalog={catalog} resource={resource} />,
    schema: ({ baseParams, resource }) => <FallbackSchemaView baseParams={baseParams} resource={resource} />,
    object: ({ catalog, resource }) => <ObjectView catalog={catalog} resource={resource} />,
};

export function getExplorerViewRegistry(route: ExplorerResolvedRoute): ExplorerViewRegistry {
    const driver = getExplorerDriver(route.driver);

    return {
        namespace: driver.views.namespace ?? DEFAULT_VIEW_REGISTRY.namespace,
        schema: driver.views.schema ?? DEFAULT_VIEW_REGISTRY.schema,
        object: ({ catalog, resource }) => {
            if (resource.objectKind === 'table' || resource.objectKind === 'view' || resource.objectKind === 'materializedView') {
                const TableView = driver.views.tableObject ?? TableResourceView;
                return <TableView catalog={catalog} resource={resource} />;
            }

            const ObjectComponent = driver.views.object ?? DEFAULT_VIEW_REGISTRY.object;
            return <ObjectComponent catalog={catalog} resource={resource} />;
        },
    };
}
