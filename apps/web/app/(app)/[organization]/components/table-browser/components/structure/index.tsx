'use client';

import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { ColumnsSection } from './columns-section';
import { PropertiesSection, TableProperties } from './properties-section';
import { DdlSection } from './ddl-section';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import {
    useTableColumnInsightsQuery,
    useTableDdlQuery,
    useTablePropertiesQuery,
    useTableStructureColumnsQuery,
} from '../table-queries';

type TableStructureProps = {
    databaseName?: string;
    tableName?: string;
};

export default function TableStructure({ databaseName, tableName }: TableStructureProps) {
    const currentConnection = useAtomValue(currentConnectionAtom);
    const connectionId = currentConnection?.connection?.id as string | undefined;

    const columnsQuery = useTableStructureColumnsQuery({
        databaseName,
        tableName,
        connectionId,
    });
    const baseColumns = columnsQuery.data?.columns ?? [];
    const columnInsightsQuery = useTableColumnInsightsQuery({
        databaseName,
        tableName,
        connectionId,
        dbType: currentConnection?.connection?.type,
        columns: baseColumns,
    });
    const propertiesQuery = useTablePropertiesQuery({ databaseName, tableName, connectionId });
    const ddlQuery = useTableDdlQuery({ databaseName, tableName, connectionId });

    const columns = useMemo(() => {
        if (!baseColumns.length) {
            return [];
        }

        const tags = columnInsightsQuery.data?.tags ?? {};
        const summaries = columnInsightsQuery.data?.summaries ?? {};

        return baseColumns.map(col => {
            const key = col.name.toLowerCase();
            const hasAiSummary = Object.prototype.hasOwnProperty.call(summaries, key);

            return {
                ...col,
                semanticTags: tags[key] ?? [],
                semanticSummary: hasAiSummary ? summaries[key] ?? null : null,
            };
        });
    }, [baseColumns, columnInsightsQuery.data]);
    const tableProperties: TableProperties | null = propertiesQuery.data ?? null;
    const ddl = ddlQuery.data ?? null;

    const loadingColumns = columnsQuery.isLoading;
    const loadingColumnTags = Boolean(baseColumns.length) && columnInsightsQuery.isFetching;
    const loadingTableProperties = propertiesQuery.isLoading;
    const loadingDdl = ddlQuery.isLoading;

    return (
        <ScrollArea className="h-full pr-3">
            <div className="space-y-6 pb-6">
                <ColumnsSection
                    tableName={tableName}
                    loading={loadingColumns}
                    loadingTags={loadingColumnTags}
                    columns={columns}
                />
                <PropertiesSection properties={tableProperties} loading={loadingTableProperties} />
                {/* <ConstraintsSection constraints={constraints} /> */}
                <DdlSection ddl={ddl} loading={loadingDdl} />
            </div>
        </ScrollArea>
    );
}
