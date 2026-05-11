import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { Locale, routing } from './routing';
import en from './locales/en.json';
import es from './locales/es.json';
import ja from './locales/ja.json';
import zh from './locales/zh.json';

const messages = {
    en,
    es,
    ja,
    zh,
};

export default getRequestConfig(async () => {
    // This typically corresponds to the `[locale]` segment
    const cookieStore = await cookies();
    let locale = (cookieStore.get('locale')?.value || 'en') as Locale;

    // Ensure that a valid locale is used
    if (!locale || !routing.locales.includes(locale)) {
        locale = routing.defaultLocale;
    }

    return {
        locale,
        messages: messages[locale],
    };
});
