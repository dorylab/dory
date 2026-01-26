import { translate } from '@/lib/i18n/i18n';
import { Locale } from '@/lib/i18n/routing';
import { getServerLocale } from '@/lib/i18n/server-locale';

export async function getApiLocale(): Promise<Locale> {
    return await getServerLocale();
}

export function translateApi(key: string, values?: Record<string, unknown>, locale?: Locale): string {
    const resolvedLocale = locale ?? 'en';
    return translate(resolvedLocale, key, values);
}
