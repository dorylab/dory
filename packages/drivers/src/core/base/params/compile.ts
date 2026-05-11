import type { ConnectionParameterDialect } from '../../registry/types';
import { isNamedParams, isPositionalParams, type DriverQueryParams } from './types';

export type CompiledQuery = {
    sql: string;
    params: DriverQueryParams | undefined;
};

export function compileParams(dialect: ConnectionParameterDialect, sql: string, params?: DriverQueryParams): CompiledQuery {
    if (!params) {
        return { sql, params: undefined };
    }

    if (dialect.parameterStyle === 'named') {
        if (!isNamedParams(params)) {
            throw new Error(`${dialect.id} requires named parameters`);
        }
        return { sql, params };
    }

    if (isPositionalParams(params)) {
        return { sql, params };
    }

    throw new Error(`${dialect.id} requires positional parameters`);
}
