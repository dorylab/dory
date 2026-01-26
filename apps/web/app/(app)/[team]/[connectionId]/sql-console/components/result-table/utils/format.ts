export function formatNumber(n?: number | null) {
    if (n == null) return '—';
    try {
        return n.toLocaleString();
    } catch {
        return String(n);
    }
}

export function formatBytes(v?: number | null) {
    if (v == null) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let x = v;
    let i = 0;
    while (x >= 1024 && i < units.length - 1) {
        x /= 1024;
        i++;
    }
    return `${x.toFixed(x < 10 && i > 0 ? 2 : 0)} ${units[i]}`;
}

export function formatDuration(ms?: number | null) {
    if (ms == null) return '—';
    if (ms < 1000) return `${ms.toFixed(0)} ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(s < 10 ? 2 : 1)} s`;
    const m = Math.floor(s / 60);
    const rest = (s % 60).toFixed(0);
    return `${m}m ${rest}s`;
}

export function formatTime(ts?: string | number | Date | null) {
    if (!ts) return '—';
    try {
        return new Date(ts).toLocaleString();
    } catch {
        return '—';
    }
}
