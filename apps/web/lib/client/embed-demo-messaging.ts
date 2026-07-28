'use client';

export type EmbedDemoEventType = 'ready' | 'started' | 'completed' | 'limit' | 'error';

const parentOriginKey = 'dory:embed-demo:parent-origin';

function isAllowedParentOrigin(origin: string) {
    if (origin === 'https://getdory.dev' || origin === 'https://www.getdory.dev') return true;
    if (process.env.NODE_ENV !== 'production') {
        try {
            const url = new URL(origin);
            return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
        } catch {
            return false;
        }
    }
    return false;
}

export function captureEmbedDemoParentOrigin() {
    if (window.parent === window || !document.referrer) return null;
    try {
        const origin = new URL(document.referrer).origin;
        if (!isAllowedParentOrigin(origin)) return null;
        sessionStorage.setItem(parentOriginKey, origin);
        return origin;
    } catch {
        return null;
    }
}

export function postEmbedDemoEvent(type: EmbedDemoEventType, detail?: Record<string, unknown>) {
    if (window.parent === window) return;
    const origin = sessionStorage.getItem(parentOriginKey) ?? captureEmbedDemoParentOrigin();
    if (!origin || !isAllowedParentOrigin(origin)) return;
    window.parent.postMessage({ source: 'dory-embed', version: 1, type, ...detail }, origin);
}
