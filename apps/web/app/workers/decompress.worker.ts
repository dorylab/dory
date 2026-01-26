// /app/workers/decompress.worker.ts
import { ungzip } from 'pako';

type JobMsg = { id: number; bufs: ArrayBuffer[]; gzFlags?: boolean[] };

self.addEventListener('message', (ev: MessageEvent<JobMsg>) => {
    const { id, bufs, gzFlags } = ev.data;
    try {
        const rows = bufs.map((buf, i) => {
            try {
                const u8 = new Uint8Array(buf);
                const gz = !!gzFlags?.[i];
                const raw = gz ? ungzip(u8) : u8;
                const json = new TextDecoder().decode(raw);
                return JSON.parse(json);
            } catch (e) {
                return { __corrupted__: true, reason: String(e).slice(0, 200) };
            }
        });

        (self as any).postMessage({ id, rows });
    } catch (e) {
        (self as any).postMessage({ id, error: String(e) });
    }
});
