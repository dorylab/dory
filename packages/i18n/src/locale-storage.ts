import { routing, type Locale } from './routing';

export type ElectronLocale = 'en-US' | 'zh-CN' | 'ja-JP' | 'es-ES';

const LOCALE_COOKIE_NAME = 'locale';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function isLocale(value: string): value is Locale {
    return routing.locales.includes(value as Locale);
}

export function normalizeLocale(value: string | null | undefined, fallback: Locale = routing.defaultLocale): Locale {
    return value && isLocale(value) ? value : fallback;
}

export function readLocaleCookie(): Locale | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE_NAME}=([^;]*)`));
    const value = match ? decodeURIComponent(match[1]) : '';
    return isLocale(value) ? value : null;
}

export function writeLocaleCookie(locale: Locale) {
    document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
    document.documentElement.lang = locale;
}

export function electronLocaleToWebLocale(locale: ElectronLocale): Locale {
    if (locale === 'zh-CN') return 'zh';
    if (locale === 'ja-JP') return 'ja';
    if (locale === 'es-ES') return 'es';
    return 'en';
}

export function webLocaleToElectronLocale(locale: Locale): ElectronLocale {
    if (locale === 'zh') return 'zh-CN';
    if (locale === 'ja') return 'ja-JP';
    if (locale === 'es') return 'es-ES';
    return 'en-US';
}
