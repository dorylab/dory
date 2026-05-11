import type { ConnectionParameterDialect } from '@dory/drivers/core';

export const DuckDbDialect: ConnectionParameterDialect = {
    id: 'duckdb',
    parameterStyle: 'positional',
};
