import { cookies } from 'next/headers';
import { Locale, routing } from './routing';

export async function getServerLocale(fallback: Locale = routing.defaultLocale): Promise<Locale> {
    try {
        const store = await cookies();
        const value = store.get('locale')?.value;
        if (value && routing.locales.includes(value as Locale)) {
            return value as Locale;
        }
    } catch {
        // No request context available; fall back to default locale.
    }

    return fallback;
}
