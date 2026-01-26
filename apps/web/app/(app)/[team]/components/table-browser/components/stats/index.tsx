'use client';

import { useAtomValue } from 'jotai';
import { Alert, AlertDescription, AlertTitle } from '@/registry/new-york-v4/ui/alert';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import SizeAndRowsCard from './components/size-and-rows-card';
import PartitionsCard from './components/partitions-card';
import StorageHealthCard from './components/storage-health-card';
import { TableHealthReportCard } from './components/ai-insight';
import { useTableStatsQuery } from '../table-queries';
import { useTranslations } from 'next-intl';
// import TTLCard from './components/ttl-card';

type TableStatsProps = {
    databaseName?: string;
    tableName?: string;
};

export default function TableStatsView({ databaseName, tableName }: TableStatsProps) {
    const currentConnection = useAtomValue(currentConnectionAtom);
    const connectionId = currentConnection?.connection.id;
    const t = useTranslations('TableStats');

    const statsQuery = useTableStatsQuery({ databaseName, tableName, connectionId });

    const stats = statsQuery.data ?? null;
    const loading = statsQuery.isLoading;
    const error =
        (!connectionId && databaseName && tableName ? t('No available connection') : null) ||
        (statsQuery.error ? (statsQuery.error as Error).message : null);

    if (!databaseName || !tableName) {
        return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{t('Select table to view stats')}</div>;
    }

    return (
        <ScrollArea className="h-full pr-3">
            <div className="space-y-4 pb-6">
                {error ? (
                    <Alert variant="destructive">
                        <AlertTitle>{t('Failed to load stats')}</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}
                <TableHealthReportCard
                    tableStats={stats}
                    databaseName={databaseName}
                    tableName={tableName}
                    connectionId={connectionId}
                />
                <SizeAndRowsCard stats={stats} loading={loading} />
                <PartitionsCard stats={stats} loading={loading} />
                <StorageHealthCard stats={stats} loading={loading} />
                {/* <TTLCard stats={stats} loading={loading} /> */}
            </div>
        </ScrollArea>
    );
}
