import { ConnectionListItem } from "@/types/connections";


export const DatasourceTypesWithDBEngine = [
    {
        type: 'postgres',
        engine: 'postgresql'
    },
    {
        type: 'clickhouse',
        engine: 'clickhouse'
    },
    {
        type: 'mysql',
        engine: 'mysql'
    },
    {
        type: 'doris',
        engine: 'doris'
    },
]

export function getDBEngineViaType(type: string): string {
    return DatasourceTypesWithDBEngine.find(t => t.type === type)?.engine || 'unknown';
}
