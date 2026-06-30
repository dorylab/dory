export type DoryRuntime = 'desktop' | 'web' | 'docker' | 'headless';
export type DoryLicense = 'oss' | 'enterprise';
export type DoryDistribution = 'stable' | 'beta';

export function normalizeRuntime(value: string | null | undefined): DoryRuntime | null {
    const runtime = value?.trim().toLowerCase();
    if (!runtime) return null;
    if (runtime === 'desktop') return 'desktop';
    if (runtime === 'docker') return 'docker';
    if (runtime === 'headless') return 'headless';
    if (runtime === 'web') return 'web';
    return null;
}

export function normalizeDistribution(value: string | null | undefined): DoryDistribution {
    return value?.trim().toLowerCase() === 'beta' ? 'beta' : 'stable';
}

export function resolveDesktopProtocolScheme(options: { protocolScheme?: string | null; distribution?: string | null } = {}): string {
    const explicit = options.protocolScheme?.trim();
    if (explicit) return explicit;

    return normalizeDistribution(options.distribution) === 'beta' ? 'dory-beta' : 'dory';
}

export function getDesktopProtocolSchemeForServer(): string {
    return resolveDesktopProtocolScheme({
        protocolScheme: process.env.DORY_PROTOCOL_SCHEME,
        distribution: process.env.DORY_DISTRIBUTION,
    });
}

function readRawRuntime(): string {
    if (typeof window === 'undefined') {
        return process.env.DORY_RUNTIME ?? process.env.NEXT_PUBLIC_DORY_RUNTIME ?? '';
    }

    return process.env.NEXT_PUBLIC_DORY_RUNTIME ?? '';
}

export const runtime: DoryRuntime = normalizeRuntime(readRawRuntime()) ?? 'web';

type BrowserBridgeRuntimeGlobal = typeof globalThis & {
    window?: {
        authBridge?: unknown;
        localeBridge?: unknown;
        themeBridge?: unknown;
        updateBridge?: unknown;
        mcpBridge?: unknown;
        electron?: unknown;
    };
};

export function hasDesktopBrowserBridge(): boolean {
    const maybeWindow = (globalThis as BrowserBridgeRuntimeGlobal).window;
    if (!maybeWindow) return false;

    return Boolean(maybeWindow.authBridge || maybeWindow.localeBridge || maybeWindow.themeBridge || maybeWindow.updateBridge || maybeWindow.mcpBridge || maybeWindow.electron);
}

export function normalizeLicense(value: string | null | undefined): DoryLicense | null {
    const license = value?.trim().toLowerCase();
    if (!license) return null;
    if (license === 'oss') return 'oss';
    if (license === 'enterprise') return 'enterprise';
    return null;
}

export function getLicenseForServer(): DoryLicense {
    if (getRuntimeForServer() === 'docker') return 'oss';

    return normalizeLicense(process.env.DORY_LICENSE) ?? 'oss';
}

export function isEnterpriseLicenseForServer(): boolean {
    return getLicenseForServer() === 'enterprise';
}

export function isDesktopRuntime(): boolean {
    return runtime === 'desktop';
}

export function isBillingAvailableRuntimeValue(value: DoryRuntime | null | undefined): boolean {
    return value === 'web';
}

export function isBillingAvailableRuntime(): boolean {
    return isBillingAvailableRuntimeValue(runtime);
}

export function isBillingEnabledForServer(): boolean {
    const resolvedRuntime = getRuntimeForServer() ?? 'web';

    return (
        isBillingAvailableRuntimeValue(resolvedRuntime) &&
        Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_WEBHOOK_SECRET?.trim() && process.env.STRIPE_PRO_MONTHLY_PRICE_ID?.trim())
    );
}

export function isDesktopBillingHandoffRuntimeForServer(): boolean {
    return getRuntimeForServer() === 'desktop';
}

export function isDesktopBillingHandoffAvailableForServer(): boolean {
    return isDesktopBillingHandoffRuntimeForServer() && Boolean((process.env.DORY_CLOUD_API_URL ?? process.env.NEXT_PUBLIC_DORY_CLOUD_API_URL ?? '').trim());
}

export function isBillingSettingsVisibleForServer(): boolean {
    return isBillingEnabledForServer() || isDesktopBillingHandoffRuntimeForServer();
}

export function isBillingManagementAvailableForServer(): boolean {
    return isBillingEnabledForServer() || isDesktopBillingHandoffAvailableForServer();
}

export function getRuntimeForServer(): DoryRuntime | null {
    const raw = process.env.DORY_RUNTIME?.trim() || process.env.NEXT_PUBLIC_DORY_RUNTIME?.trim() || '';
    return normalizeRuntime(raw);
}
