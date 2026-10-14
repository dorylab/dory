export function createCachedAsyncFactory<T>(factory: () => Promise<T>) {
    let cachedPromise: Promise<T> | null = null;

    return async function getCached(): Promise<T> {
        if (!cachedPromise) {
            cachedPromise = Promise.resolve()
                .then(factory)
                .catch(error => {
                    cachedPromise = null;
                    throw error;
                });
        }
        return cachedPromise;
    };
}
