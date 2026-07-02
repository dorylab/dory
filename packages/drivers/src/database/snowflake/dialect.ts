import type { ConnectionParameterDialect } from '@dory/drivers/core';

export const SnowflakeDialect: ConnectionParameterDialect = {
    id: 'snowflake',
    parameterStyle: 'positional',
};
