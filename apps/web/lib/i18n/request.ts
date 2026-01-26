import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { Locale, routing } from './routing';

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
        messages: (await import(`../../public/locales/${locale}.json`)).default,
    };
});
