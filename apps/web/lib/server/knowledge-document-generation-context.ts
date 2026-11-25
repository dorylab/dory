import 'server-only';

import { encrypt, decrypt } from '@dory/shared/utils/crypto';
import { NextRequest } from 'next/server';

// Request credentials are encrypted at rest and never included in task summaries or drafts.
export async function captureDocumentGenerationRequest(req: NextRequest): Promise<string> {
    const headers: Record<string, string> = {};
    const authorization = req.headers.get('authorization');
    if (authorization) headers.authorization = authorization;
    const cookies = (req.headers.get('cookie') ?? '')
        .split(';')
        .map(value => value.trim())
        .filter(value => /^(?:(?:__Secure-)?better-auth\.session_token|dory\.desktop_session_token)=/.test(value));
    if (cookies.length) headers.cookie = cookies.join('; ');
    return encrypt(JSON.stringify({ origin: new URL(req.url).origin, headers }));
}

export async function restoreDocumentGenerationRequest(context: string | null): Promise<NextRequest | undefined> {
    if (!context) return undefined;
    try {
        const value = JSON.parse(await decrypt(context)) as { origin: string; headers: Record<string, string> };
        return new NextRequest(new URL('/api/actions/execute', value.origin), { headers: value.headers });
    } catch {
        throw new Error('AUTH_REQUIRED');
    }
}
