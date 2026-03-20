export const formatBytes = (bytes?: number | null) => {
    if (!Number.isFinite(bytes ?? NaN)) return '-';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const value = bytes ?? 0;
    const i = Math.min(units.length - 1, Math.floor(Math.log(value || 1) / Math.log(1024)));
    const sized = value / Math.pow(1024, i);
    const decimal = sized >= 100 ? 0 : sized >= 10 ? 1 : 2;
    return `${sized.toFixed(decimal)} ${units[i]}`;
};

export const formatNumber = (value?: number | null) => {
    if (!Number.isFinite(value ?? NaN)) return '-';
    return Math.trunc(value as number).toLocaleString();
};

export const formatRatio = (value?: number | null) => {
    if (!Number.isFinite(value ?? NaN)) return '-';
    return `${(value as number).toFixed(2)}x`;
};

export const calcRatio = (compressed?: number | null, uncompressed?: number | null) => {
    if (!Number.isFinite(compressed ?? NaN) || !Number.isFinite(uncompressed ?? NaN) || !uncompressed) return '-';
    const ratio = (compressed as number) / (uncompressed as number);
    if (!Number.isFinite(ratio) || ratio <= 0) return '-';
    return formatRatio(ratio);
};
