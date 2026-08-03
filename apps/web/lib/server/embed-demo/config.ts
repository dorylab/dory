import type { Locale } from '@dory/i18n/routing';

export const EMBED_DEMO_TTL_MS = 24 * 60 * 60 * 1_000;
export const EMBED_DEMO_IP_SESSION_LIMIT = 3;

const supportedLocales = new Set<Locale>(['en', 'zh', 'ja', 'es']);

export function normalizeEmbedDemoLocale(value: unknown): Locale {
    return typeof value === 'string' && supportedLocales.has(value as Locale) ? (value as Locale) : 'en';
}

export function getEmbedDemoHost(env: Record<string, string | undefined> = process.env) {
    return env.DORY_EMBED_DEMO_HOST?.trim().toLowerCase() || 'demo.app.getdory.dev';
}

export function isAllowedEmbedDemoHost(host: string | null, env: Record<string, string | undefined> = process.env) {
    const normalized = host?.split(':')[0]?.trim().toLowerCase();
    if (!normalized) return false;
    if (env.NODE_ENV !== 'production' && (normalized === 'localhost' || normalized === '127.0.0.1')) return true;
    return normalized === getEmbedDemoHost(env);
}
