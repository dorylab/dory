'use client';

import TableStructure from '@/app/(app)/[organization]/components/table-browser/components/structure';

type TableColumnsProps = {
    database: string;
    table: string;
};

export function TableColumns({ database, table }: TableColumnsProps) {
    return <TableStructure databaseName={database} tableName={table} />;
}
