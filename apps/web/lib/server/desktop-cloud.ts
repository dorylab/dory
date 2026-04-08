import { headers } from 'next/headers';
import { createAuthProxyHeaders } from '@/lib/auth/auth-proxy';
import { getCloudApiBaseUrl } from '@/lib/cloud/url';
import { getDesktopCloudStateFromFlags } from '@/lib/runtime/cloud-capabilities';
import { getRuntimeForServer } from '@/lib/runtime/runtime';

export type DesktopCloudState = 'available' | 'not_configured' | 'unreachable';

export type DesktopCloudResponse =
    | {
          state: 'available';
          response: Response;
          baseUrl: string;
      }
    | {
          state: 'not_configured' | 'unreachable';
          response: null;
          baseUrl: string | null;
      };

export { getDesktopCloudStateFromFlags } from '@/lib/runtime/cloud-capabilities';

export async function fetchDesktopCloud(pathname: string, init: RequestInit = {}): Promise<DesktopCloudResponse> {
    if (getRuntimeForServer() !== 'desktop') {
        return {
            state: 'not_configured',
            response: null,
            baseUrl: null,
        };
    }

    const baseUrl = getCloudApiBaseUrl();
    if (!baseUrl) {
        return {
            state: 'not_configured',
            response: null,
            baseUrl: null,
        };
    }

    const incomingHeaders = await headers();
    const forwardedHeaders = createAuthProxyHeaders(incomingHeaders, baseUrl);
    const requestHeaders = new Headers(forwardedHeaders);
    const initHeaders = new Headers(init.headers ?? {});
    initHeaders.forEach((value, key) => {
        requestHeaders.set(key, value);
    });

    try {
        const response = await fetch(new URL(pathname, baseUrl).toString(), {
            ...init,
            headers: requestHeaders,
            cache: init.cache ?? 'no-store',
        });

        return {
            state: 'available',
            response,
            baseUrl,
        };
    } catch {
        return {
            state: 'unreachable',
            response: null,
            baseUrl,
        };
    }
}
