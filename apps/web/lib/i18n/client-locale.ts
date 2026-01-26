import { Locale, routing } from './routing';

export function getClientLocale(fallback: Locale = routing.defaultLocale): Locale {
    if (typeof document === 'undefined') return fallback;
    const match = document.cookie.match(/(?:^|; )locale=([^;]*)/);
    const value = match ? decodeURIComponent(match[1]) : '';
    return routing.locales.includes(value as Locale) ? (value as Locale) : fallback;
}
