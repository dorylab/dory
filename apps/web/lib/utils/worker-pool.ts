type WorkerTask = {
    id: number;
    bufs: ArrayBuffer[];
    gzFlags?: boolean[];
    resolve: (rows: any[]) => void;
    reject: (e: any) => void;
};

export function createWorkerPool(count: number) {
    if (typeof window === 'undefined') {
        return {
            postBuffers: async () => {
                throw new Error('Worker pool is only available in the browser.');
            },
            terminate() {},
        };
    }

    const workers: Worker[] = [];
    const busy = new Set<number>();
    const queue: WorkerTask[] = [];
    let seq = 1;

    for (let i = 0; i < Math.max(1, count | 0); i++) {
        // ✅ Recommended: inline new URL + relative path + { type: 'module' }
        const w = new Worker(new URL('../../app/workers/decompress.worker.ts', import.meta.url), { type: 'module' });
        workers[i] = w;
    }

    function dispatch() {
        for (let i = 0; i < workers.length; i++) {
            if (busy.has(i)) continue;
            const w = workers[i];
            if (!w) continue;

            const task = queue.shift();
            if (!task) break;

            busy.add(i);

            const onMessage = (ev: MessageEvent) => {
                const { id, rows, error } = ev.data as any;
                if (id !== task.id) return;
                w.removeEventListener('message', onMessage);
                w.removeEventListener('error', onError as any);
                busy.delete(i);
                if (error) task.reject(new Error(error));
                else task.resolve(rows);
                dispatch();
            };

            const onError = (e: MessageEvent | ErrorEvent) => {
                w.removeEventListener('message', onMessage);
                w.removeEventListener('error', onError as any);
                busy.delete(i);
                task.reject(e);
                dispatch();
            };

            w.addEventListener('message', onMessage);
            w.addEventListener('error', onError as any);

            (w as any).postMessage({ id: task.id, bufs: task.bufs, gzFlags: task.gzFlags }, task.bufs);
        }
    }

    function postBuffers(bufs: ArrayBuffer[], gzFlags?: boolean[]) {
        if (!workers.length) {
            return Promise.reject(new Error('No workers available.'));
        }
        const id = seq++;
        return new Promise<any[]>((resolve, reject) => {
            queue.push({ id, bufs, gzFlags, resolve, reject });
            dispatch();
        });
    }

    function terminate() {
        workers.forEach(w => w?.terminate());
        busy.clear();
        queue.splice(0, queue.length);
    }

    return { postBuffers, terminate };
}
