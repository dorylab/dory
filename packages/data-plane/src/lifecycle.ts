export function dataStreamAbortError() {
    return new DOMException('The data stream was canceled', 'AbortError');
}

export function normalizeBatchRows(value?: number) {
    return Number.isFinite(value) && value! > 0 ? Math.max(1, Math.floor(value!)) : 10_000;
}

export function normalizeBatchBytes(value?: number) {
    return Number.isFinite(value) && value! > 0 ? Math.max(1024, Math.floor(value!)) : 32 * 1024 * 1024;
}

export function onceAsync(fn: () => Promise<void> | void): () => Promise<void> {
    let called = false;
    return async () => {
        if (called) return;
        called = true;
        await fn();
    };
}
