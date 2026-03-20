'use client';

import TableDataPreview from '@/app/(app)/[organization]/components/table-browser/components/data-preview';

type TablePreviewProps = {
    connectionId?: string;
    database: string;
    table: string;
};

export function TablePreview({ connectionId, database, table }: TablePreviewProps) {
    return <TableDataPreview connectionId={connectionId} databaseName={database} tableName={table} />;
}
