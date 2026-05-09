import { ConnectionListItem } from '@/types/connections';

export const DatasourceTypesWithDBEngine = [
    {
        type: 'postgres',
        engine: 'postgres',
    },
    {
        type: 'neon',
        engine: 'postgres',
    },
    {
        type: 'clickhouse',
        engine: 'clickhouse',
    },
    {
        type: 'duckdb',
        engine: 'duckdb',
    },
    {
        type: 'mysql',
        engine: 'mysql',
    },
    {
        type: 'mariadb',
        engine: 'mariadb',
    },
    {
        type: 'doris',
        engine: 'doris',
    },
    {
        type: 'sqlite',
        engine: 'sqlite',
    },
];

export function getDBEngineViaType(type: string): string {
    return DatasourceTypesWithDBEngine.find(t => t.type === type)?.engine || 'unknown';
}
