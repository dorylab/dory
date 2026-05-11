const DEFAULT_CONNECTION_TIMEOUT_MS = 20_000;
const DEFAULT_QUERY_REQUEST_TIMEOUT_MS = 120_000;

export const CONNECTION_REQUEST_TIMEOUT_MS = Number.isFinite(Number(process.env.CONNECTION_REQUEST_TIMEOUT_MS))
    ? Math.max(1000, Number(process.env.CONNECTION_REQUEST_TIMEOUT_MS))
    : DEFAULT_CONNECTION_TIMEOUT_MS;

export const QUERY_REQUEST_TIMEOUT_MS = Number.isFinite(Number(process.env.QUERY_REQUEST_TIMEOUT_MS))
    ? Math.max(1000, Number(process.env.QUERY_REQUEST_TIMEOUT_MS))
    : DEFAULT_QUERY_REQUEST_TIMEOUT_MS;

export function resolveConnectionTimeoutMs(timeoutMs?: unknown): number {
    if (typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0) {
        return Math.max(1000, Math.trunc(timeoutMs));
    }

    return CONNECTION_REQUEST_TIMEOUT_MS;
}

export function withConnectionTimeout<T>(promise: Promise<T>, timeoutMs?: unknown): Promise<T> {
    const resolvedTimeoutMs = resolveConnectionTimeoutMs(timeoutMs);

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Connection timed out after ${resolvedTimeoutMs}ms`));
        }, resolvedTimeoutMs);

        promise
            .then(resolve)
            .catch(reject)
            .finally(() => clearTimeout(timer));
    });
}

export function applyQueryRequestTimeout(options: Record<string, unknown>): Record<string, unknown> {
    options.request_timeout = QUERY_REQUEST_TIMEOUT_MS;
    return options;
}
