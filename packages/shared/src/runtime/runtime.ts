export type DoryRuntime = 'desktop' | 'web' | 'docker';

export function normalizeRuntime(value: string | null | undefined): DoryRuntime | null {
    const runtime = value?.trim().toLowerCase();
    if (!runtime) return null;
    if (runtime === 'desktop') return 'desktop';
    if (runtime === 'docker') return 'docker';
    if (runtime === 'web') return 'web';
    return null;
}

function readRawRuntime(): string {
    if (typeof window === 'undefined') {
        return process.env.DORY_RUNTIME ?? process.env.NEXT_PUBLIC_DORY_RUNTIME ?? '';
    }

    return process.env.NEXT_PUBLIC_DORY_RUNTIME ?? '';
}

export const runtime: DoryRuntime = normalizeRuntime(readRawRuntime()) ?? 'web';

export function isDesktopRuntime(): boolean {
    return runtime === 'desktop';
}

export function isBillingAvailableRuntimeValue(value: DoryRuntime | null | undefined): boolean {
    return value === 'web' || value === 'docker';
}

export function isBillingAvailableRuntime(): boolean {
    return isBillingAvailableRuntimeValue(runtime);
}

export function isBillingEnabledForServer(): boolean {
    const resolvedRuntime = getRuntimeForServer() ?? 'web';

    return (
        isBillingAvailableRuntimeValue(resolvedRuntime) &&
        Boolean(
            process.env.STRIPE_SECRET_KEY?.trim() &&
                process.env.STRIPE_WEBHOOK_SECRET?.trim() &&
                process.env.STRIPE_PRO_MONTHLY_PRICE_ID?.trim(),
        )
    );
}

export function isDesktopBillingHandoffRuntimeForServer(): boolean {
    return getRuntimeForServer() === 'desktop';
}

export function isDesktopBillingHandoffAvailableForServer(): boolean {
    return (
        isDesktopBillingHandoffRuntimeForServer() &&
        Boolean((process.env.DORY_CLOUD_API_URL ?? process.env.NEXT_PUBLIC_DORY_CLOUD_API_URL ?? '').trim())
    );
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
