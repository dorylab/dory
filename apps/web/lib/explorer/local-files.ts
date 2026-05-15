export function parseConnectionOptions(raw: unknown): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
        } catch {
            return {};
        }
    }
    return {};
}

export function isLocalFilesDataset(rawOptions: unknown) {
    const options = parseConnectionOptions(rawOptions);
    return options.managedBy === 'local-files' && options.mode === 'localFilesDataset';
}

export function getLocalFilesSchemaName(rawOptions: unknown) {
    const options = parseConnectionOptions(rawOptions);
    if (options.managedBy !== 'local-files' || options.mode !== 'localFilesDataset') return null;
    return typeof options.schemaName === 'string' && options.schemaName.trim() ? options.schemaName.trim() : null;
}

export function stripLocalFilesSchemaPrefix(value: string, localFilesSchemaName?: string | null) {
    const schemaName = localFilesSchemaName?.trim();
    if (!schemaName) return value;
    const prefix = `${schemaName}.`;
    return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

export function formatLocalFilesBreadcrumbLabel(value: string, localFilesSchemaName?: string | null) {
    const stripped = stripLocalFilesSchemaPrefix(value, localFilesSchemaName);
    if (stripped !== value) return stripped;

    const parts = value.split('.');
    if (parts.length > 1) {
        return parts.slice(1).join('.');
    }
    return value;
}
