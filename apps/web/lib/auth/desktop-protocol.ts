import { getDesktopProtocolSchemeForServer } from '@dory/shared/runtime';

export const DORY_DESKTOP_PROTOCOL_HEADER = 'x-dory-desktop-protocol-scheme';

export function normalizeRequestedDesktopProtocolScheme(value: string | null | undefined): string | null {
    const scheme = value?.trim().toLowerCase();
    if (!scheme) return null;
    if (!/^dory(?:-[a-z0-9][a-z0-9-]{0,30})?$/.test(scheme)) return null;
    return scheme;
}

export function getDesktopProtocolSchemeForAuth(headers?: Headers | null): string {
    return normalizeRequestedDesktopProtocolScheme(headers?.get(DORY_DESKTOP_PROTOCOL_HEADER)) ?? getDesktopProtocolSchemeForServer();
}
