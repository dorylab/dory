'use client';

import { DriverTableBrowser } from '@/app/(app)/[organization]/components/table-browser/driver-table-browser';
import type { ExplorerResource } from '@/lib/explorer/types';
import { useTable } from '../hooks/use-table';

type TableResourceViewProps = {
    catalog: string;
    resource: Extract<ExplorerResource, { kind: 'object' }>;
};

export function TableResourceView({ resource }: TableResourceViewProps) {
    const { connectionId, driver, database, tableName } = useTable(resource);

    return <DriverTableBrowser driver={driver.table.getTableBrowserDriver()} connectionId={connectionId} databaseName={database} tableName={tableName} />;
}
