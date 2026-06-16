import { ConnectionListItem } from '@dory/shared/types/connections';

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
        type: 'cloudflare-d1',
        engine: 'cloudflare-d1',
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
        type: 'oracle',
        engine: 'oracle',
    },
    {
        type: 'doris',
        engine: 'doris',
    },
    {
        type: 'sqlite',
        engine: 'sqlite',
    },
    {
        type: 'sqlserver',
        engine: 'sqlserver',
    },
];

export function getDBEngineViaType(type: string): string {
    return DatasourceTypesWithDBEngine.find(t => t.type === type)?.engine || 'unknown';
}
