import { translate } from '@/lib/i18n/i18n';
import { Locale } from '@/lib/i18n/routing';
import { getServerLocale } from '@/lib/i18n/server-locale';

export function translateDatabase(
    key: string,
    values?: Record<string, unknown>,
    options?: { locale?: Locale },
): string {
    const locale = options?.locale || 'en';
    return translate(locale, key, values);
}
