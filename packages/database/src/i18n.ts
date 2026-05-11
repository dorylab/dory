export function translateDatabase(
    key: string,
    values?: Record<string, unknown>,
    _options?: { locale?: string },
): string {
    if (!values) return key;
    return Object.entries(values).reduce(
        (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
        key,
    );
}
