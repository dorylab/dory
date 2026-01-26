/* ---------- utils ---------- */
export function formatValue(v: unknown) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
}
export function formatTooltip(v: unknown) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
        try {
            return JSON.stringify(v);
        } catch {
            return '[object]';
        }
    }
    return String(v);
}
