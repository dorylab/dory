import type { ConnectionParameterDialect } from '@/lib/connection/registry/types';

export const DuckDbDialect: ConnectionParameterDialect = {
    id: 'duckdb',
    parameterStyle: 'positional',
};
