export const parseList = (value: string): string[] =>
    value
        .split(/[,\n]/)
        .map(entry => entry.trim())
        .filter(Boolean);

export const toDisplayList = (values?: string[], fallback: string = '—'): string =>
    values?.length ? values.join(', ') : fallback;
