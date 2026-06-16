import type { ConnectionParameterDialect } from '@dory/drivers/core';

export const CloudflareD1Dialect: ConnectionParameterDialect = {
    id: 'cloudflare-d1',
    parameterStyle: 'positional',
};
