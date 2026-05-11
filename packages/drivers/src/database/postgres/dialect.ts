import type { ConnectionParameterDialect } from '@dory/drivers/core';

export const PostgresDialect: ConnectionParameterDialect = {
    id: 'postgres',
    parameterStyle: 'positional',
};
