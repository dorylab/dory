export function onceAsync(fn: () => Promise<void> | void): () => Promise<void> {
    let called = false;
    return async () => {
        if (called) return;
        called = true;
        await fn();
    };
}

export async function* asyncIterableWithCleanup<Row>(iterable: AsyncIterable<Row>, cleanup: () => Promise<void> | void): AsyncIterable<Row> {
    try {
        for await (const row of iterable) {
            yield row;
        }
    } finally {
        await cleanup();
    }
}
