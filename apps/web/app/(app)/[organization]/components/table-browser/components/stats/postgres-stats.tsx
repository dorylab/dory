'use client';

import { useAtomValue } from 'jotai';
import { Alert, AlertDescription, AlertTitle } from '@/registry/new-york-v4/ui/alert';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { useTableStatsQuery } from '../table-queries';
import { useTranslations } from 'next-intl';
import PostgresSizeCard from './components/postgres-size-card';
import PostgresIndexUsageCard from './components/postgres-index-usage-card';
import PostgresVacuumCard from './components/postgres-vacuum-card';

type Props = {
    databaseName?: string;
    tableName?: string;
};

export default function PostgresTableStatsView({ databaseName, tableName }: Props) {
    const currentConnection = useAtomValue(currentConnectionAtom);
    const connectionId = currentConnection?.connection.id;
    const t = useTranslations('PostgresTableStats');

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
                <PostgresSizeCard stats={stats} loading={loading} />
                <PostgresIndexUsageCard indexUsage={stats?.indexUsage} loading={loading} />
                <PostgresVacuumCard vacuumHealth={stats?.vacuumHealth} loading={loading} />
            </div>
        </ScrollArea>
    );
}
