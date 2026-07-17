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

export function formatCompactDuration(ms?: number | null) {
    if (ms == null || !Number.isFinite(ms)) return '—';
    if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
    const seconds = ms / 1000;
    if (seconds < 60) return `${Number(seconds.toFixed(seconds < 10 ? 2 : 1))}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
}

export function formatRelativeTimestamp(timestamp?: number | null, locale = 'en', now = Date.now()) {
    if (timestamp == null || !Number.isFinite(timestamp)) return null;
    const difference = timestamp - now;
    const absoluteDifference = Math.abs(difference);
    const units: Array<{ unit: Intl.RelativeTimeFormatUnit; milliseconds: number }> = [
        { unit: 'year', milliseconds: 365 * 24 * 60 * 60 * 1000 },
        { unit: 'month', milliseconds: 30 * 24 * 60 * 60 * 1000 },
        { unit: 'day', milliseconds: 24 * 60 * 60 * 1000 },
        { unit: 'hour', milliseconds: 60 * 60 * 1000 },
        { unit: 'minute', milliseconds: 60 * 1000 },
        { unit: 'second', milliseconds: 1000 },
    ];
    const selected = units.find(candidate => absoluteDifference >= candidate.milliseconds) ?? units[units.length - 1]!;
    return new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(Math.round(difference / selected.milliseconds), selected.unit);
}

const CONNECTION_TYPE_LABELS: Record<string, string> = {
    'cloudflare-d1': 'Cloudflare D1',
    clickhouse: 'ClickHouse',
    duckdb: 'DuckDB',
    mariadb: 'MariaDB',
    mysql: 'MySQL',
    neon: 'Neon',
    oracle: 'Oracle',
    postgres: 'PostgreSQL',
    snowflake: 'Snowflake',
    sqlite: 'SQLite',
    sqlserver: 'SQL Server',
    supabase: 'Supabase',
};

export function formatResultSetSource(connectionType?: string | null, databaseName?: string | null) {
    const typeLabel = connectionType ? (CONNECTION_TYPE_LABELS[connectionType] ?? connectionType) : null;
    return [typeLabel, databaseName].filter(Boolean).join(' / ') || '—';
}

export type ResultSetStorageLabel = 'LocalParquet' | 'S3Parquet' | 'Parquet' | 'LocalJsonPreview' | 'S3JsonPreview' | 'JsonPreview' | 'NotRetained';

export function getResultSetStorageLabel(params: {
    artifactStore?: string | null;
    storageFormat?: 'parquet' | 'json' | null;
    dataAvailability?: string | null;
}): ResultSetStorageLabel {
    if (!params.dataAvailability || params.dataAvailability === 'none') return 'NotRetained';
    const isJson = params.storageFormat === 'json' || params.dataAvailability === 'preview-only';
    if (params.artifactStore === 'filesystem') return isJson ? 'LocalJsonPreview' : 'LocalParquet';
    if (params.artifactStore === 's3') return isJson ? 'S3JsonPreview' : 'S3Parquet';
    return isJson ? 'JsonPreview' : 'Parquet';
}

export function formatTime(ts?: string | number | Date | null) {
    if (!ts) return '—';
    try {
        return new Date(ts).toLocaleString();
    } catch {
        return '—';
    }
}
