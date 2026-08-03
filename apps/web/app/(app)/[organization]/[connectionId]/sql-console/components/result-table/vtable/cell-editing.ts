export type CellEditorKind = 'text' | 'number' | 'precise-number' | 'boolean' | 'date' | 'complex';

export function getCellEditorKind(type?: string | null): CellEditorKind {
    const normalized = type?.toLowerCase() ?? '';
    if (/(json|array|struct|map|blob|binary|bytea|geometry|geography|interval)/.test(normalized)) return 'complex';
    if (/(bool|boolean)/.test(normalized)) return 'boolean';
    if (/(bigint|bigserial|decimal|numeric|number)/.test(normalized)) return 'precise-number';
    if (/(tinyint|smallint|mediumint|integer|int|serial|float|double|real)/.test(normalized)) return 'number';
    if (/(date|time|timestamp)/.test(normalized)) return 'date';
    return 'text';
}

export function toEditDraft(value: unknown) {
    if (value == null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

export function toDateEditDraft(value: unknown, type?: string | null) {
    const draft = toEditDraft(value);
    if (/timestamp|datetime/i.test(type ?? '')) return draft.replace(' ', 'T').replace(/Z$/, '');
    if (/\btime\b/i.test(type ?? '')) return draft.match(/\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?/)?.[0] ?? draft;
    return draft.slice(0, 10);
}

export function getDateInputType(type?: string | null): 'date' | 'datetime-local' | 'time' {
    if (/timestamp|datetime/i.test(type ?? '')) return 'datetime-local';
    if (/\btime\b/i.test(type ?? '')) return 'time';
    return 'date';
}

export function parseEditDraft(kind: CellEditorKind, draft: string, messages: { chooseBoolean: string; invalidNumber: string }): unknown {
    if (kind === 'boolean') {
        if (draft !== 'true' && draft !== 'false') throw new Error(messages.chooseBoolean);
        return draft === 'true';
    }
    if (kind === 'number') {
        const value = Number(draft);
        if (!draft.trim() || !Number.isFinite(value)) {
            throw new Error(messages.invalidNumber);
        }
        return value;
    }
    if (kind === 'precise-number') {
        const trimmed = draft.trim();
        if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
            throw new Error(messages.invalidNumber);
        }
        return trimmed;
    }
    return draft;
}
