/**
 * Compact ClickHouse types by removing long enum values, etc.
 */

export function formatTypeForPrompt(
    type?: string | null,
    options?: {
        locale?: string;
        unknownLabel?: string;
    },
) {
    const unknownLabel = options?.unknownLabel ?? 'Unknown';
    if (!type) return unknownLabel;

    let t = type;

    // Enum8('x'=1, 'y'=2, ...) -> Enum
    t = t.replace(/Enum\d*\([^)]*\)/gi, 'Enum');

    // If LowCardinality is too verbose, keep only the inner type:
    // LowCardinality(String) -> String
    // Keep as-is for now:
    // t = t.replace(/LowCardinality\(([^)]+)\)/i, '$1');

    return t;
}
