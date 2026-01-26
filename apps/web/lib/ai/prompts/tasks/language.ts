import { translate } from '@/lib/i18n/i18n';
import { routing, type Locale } from '@/lib/i18n/routing';

export function getPromptLanguageLine(locale?: string | null): string {
    const effectiveLocale = (locale ?? routing.defaultLocale) as Locale;
    return translate(effectiveLocale, 'Ai.PromptLanguage');
}
