import type { ConnectionParameterDialect } from '@dory/drivers/core';

export const MySqlDialect: ConnectionParameterDialect = {
    id: 'mysql',
    parameterStyle: 'positional',
};
