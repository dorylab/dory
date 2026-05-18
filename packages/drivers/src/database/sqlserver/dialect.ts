import type { ConnectionParameterDialect } from '@dory/drivers/core';

export const SqlServerDialect: ConnectionParameterDialect = {
    id: 'sqlserver',
    parameterStyle: 'named',
};
