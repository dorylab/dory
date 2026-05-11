import { translate } from '@dory/i18n/translate';
import { routing, type Locale } from '@dory/i18n/routing';

export function getPromptLanguageLine(locale?: string | null): string {
    const effectiveLocale = (locale ?? routing.defaultLocale) as Locale;
    return translate(effectiveLocale, 'Ai.PromptLanguage');
}
