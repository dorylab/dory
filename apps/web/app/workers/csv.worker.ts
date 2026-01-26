// app/workers/csv.worker.ts
self.onmessage = (e: MessageEvent) => {
    const { rows } = e.data as { rows: any[] };
    if (!rows?.length) {
        (self as any).postMessage({ ok: true, url: null });
        return;
    }
    const cols = Object.keys(rows[0] ?? {});
    const header = cols.join(',') + '\n';
    let out = header;

    //Splicing line by line (if there is a very large JSON, consider toString/truncation first)
    for (const r of rows) {
        out +=
            cols
                .map(k => {
                    const v = r?.[k];
                    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
                    return `"${s.replace(/"/g, '""')}"`;
                })
                .join(',') + '\n';
    }

    const blob = new Blob([out], { type: 'text/csv;charset=utf-8;' });
    (self as any).postMessage({ ok: true, url: URL.createObjectURL(blob) });
};
export {};
