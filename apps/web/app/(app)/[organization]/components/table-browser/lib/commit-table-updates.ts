import type { TableUpdateResult, TableUpdateRow } from '@dory/drivers/types';

import { executeActionClient } from '@/lib/actions/client';

export function commitTableUpdates({ connectionId, database, table, rows }: { connectionId: string; database: string; table: string; rows: TableUpdateRow[] }) {
    return executeActionClient<TableUpdateResult>(
        'table.commitUpdates',
        {
            connectionId,
            database,
            table,
            rows,
        },
        { currentConnectionId: connectionId },
    );
}
