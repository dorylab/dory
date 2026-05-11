import type { ConnectionParameterDialect } from '@dory/drivers/core';

export const ClickhouseDialect: ConnectionParameterDialect = {
    id: 'clickhouse',
    parameterStyle: 'named',
};
