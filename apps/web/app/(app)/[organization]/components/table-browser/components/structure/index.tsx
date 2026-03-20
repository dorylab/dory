'use client';

import { useAtomValue } from 'jotai';
import { ColumnsSection } from './columns-section';
import { PropertiesSection, TableProperties } from './properties-section';
import { DdlSection } from './ddl-section';
import { ScrollArea } from '@/registry/new-york-v4/ui/scroll-area';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { useTableColumnsQuery, useTableDdlQuery, useTablePropertiesQuery } from '../table-queries';

type TableStructureProps = {
    databaseName?: string;
    tableName?: string;
};

export default function TableStructure({ databaseName, tableName }: TableStructureProps) {
    const currentConnection = useAtomValue(currentConnectionAtom);
    const connectionId = currentConnection?.connection.id as string | undefined;

    const columnsQuery = useTableColumnsQuery({
        databaseName,
        tableName,
        connectionId,
        dbType: currentConnection?.connection.type,
    });
    const propertiesQuery = useTablePropertiesQuery({ databaseName, tableName, connectionId });
    const ddlQuery = useTableDdlQuery({ databaseName, tableName, connectionId });

    const columns = columnsQuery.data?.columns ?? [];
    const tableProperties: TableProperties | null = propertiesQuery.data ?? null;
    const ddl = ddlQuery.data ?? null;

    const loadingColumns = columnsQuery.isLoading;
    const loadingColumnTags = columnsQuery.isFetching && !columnsQuery.isLoading;
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
