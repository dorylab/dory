import type { ConnectionParameterDialect } from '@dory/drivers/core';

export const OracleDialect: ConnectionParameterDialect = {
    id: 'oracle',
    parameterStyle: 'named',
};
