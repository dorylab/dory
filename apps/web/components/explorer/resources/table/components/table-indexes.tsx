'use client';

import { useTranslations } from 'next-intl';
import { TableIndexesTab } from '@/app/(app)/[organization]/components/table-browser/components/indexes';
import type { ExplorerResource } from '@/lib/explorer/types';
import { useTable } from '../hooks/use-table';

type TableIndexesProps = {
    resource: Extract<ExplorerResource, { kind: 'object' }>;
};

export function TableIndexes({ resource }: TableIndexesProps) {
    const t = useTranslations('PostgresExplorer');
    const { connectionId, driver } = useTable(resource);
    const target = driver.table.getTableIndexes(resource);

    return <TableIndexesTab connectionId={connectionId} database={target.database} table={target.table} emptyText={t('Indexes.Empty')} />;
}
