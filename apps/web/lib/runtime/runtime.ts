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

export function getRuntimeForServer(): DoryRuntime | null {
    const raw = process.env.DORY_RUNTIME?.trim() || process.env.NEXT_PUBLIC_DORY_RUNTIME?.trim() || '';
    return normalizeRuntime(raw);
}
