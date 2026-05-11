import { translate } from '@dory/i18n/translate';
import { Locale } from '@dory/i18n/routing';
import { getServerLocale } from '@dory/i18n/server';

export async function getApiLocale(): Promise<Locale> {
    return await getServerLocale();
}

export function translateApi(key: string, values?: Record<string, unknown>, locale?: Locale): string {
    const resolvedLocale = locale ?? 'en';
    return translate(resolvedLocale, key, values);
}
