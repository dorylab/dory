export type NamedParams = Record<string, unknown>;
export type PositionalParams = unknown[];
export type DriverQueryParams = NamedParams | PositionalParams;

export function isNamedParams(params: DriverQueryParams | undefined): params is NamedParams {
    return !!params && !Array.isArray(params);
}

export function isPositionalParams(params: DriverQueryParams | undefined): params is PositionalParams {
    return Array.isArray(params);
}
