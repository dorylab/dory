import type { ConnectionParameterDialect } from '@dory/drivers/core';

export const SqliteDialect: ConnectionParameterDialect = {
    id: 'sqlite',
    parameterStyle: 'positional',
};
