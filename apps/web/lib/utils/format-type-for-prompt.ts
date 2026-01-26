/**
 * Compact ClickHouse types by removing long enum values, etc.
 */
import { translate } from '@/lib/i18n/i18n';
import { Locale } from '@/lib/i18n/routing';

export function formatTypeForPrompt(
    type?: string | null,
    options?: {
        locale?: Locale;
        unknownLabel?: string;
    },
) {
    const locale = options?.locale ?? 'zh';
    const unknownLabel = options?.unknownLabel ?? translate(locale, 'Utils.FormatType.Unknown');
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
