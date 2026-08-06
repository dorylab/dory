const ERROR_LINK_KEYS = ['errors', 'precedingErrors', 'originalError', 'cause'] as const;

export function getImportErrorMessage(error: unknown, fallback = 'The import failed without an error message'): string {
    return findErrorMessage(error, new Set()) ?? fallback;
}

function findErrorMessage(value: unknown, seen: Set<object>): string | null {
    if (typeof value === 'string') return value.trim() || null;
    if (value === null || typeof value !== 'object') return null;
    if (seen.has(value)) return null;
    seen.add(value);

    if (value instanceof Error) {
        const message = value.message.trim();
        if (message) return message;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            const message = findErrorMessage(item, seen);
            if (message) return message;
        }
        return null;
    }

    const record = value as Record<string, unknown>;
    for (const key of ERROR_LINK_KEYS) {
        const message = findErrorMessage(record[key], seen);
        if (message) return message;
    }
    return null;
}
