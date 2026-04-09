import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getAuth } from '@/lib/auth';
import { shouldProxyAuthRequest } from '@/lib/auth/auth-proxy';
import { getClient } from '@/lib/database/postgres/client';
import { schema } from '@/lib/database/schema';

const ANONYMOUS_RECOVERY_COOKIE_NAME = 'dory.anonymous_recovery';
const ANONYMOUS_RECOVERY_COOKIE_TTL_SECONDS = 60 * 60 * 24 * 180;
const ANONYMOUS_RECOVERY_TOKEN_VERSION = 1;

type AnonymousRecoveryPayload = {
    version: number;
    userId: string;
    activeOrganizationId: string | null;
};

function toBase64Url(input: string) {
    return Buffer.from(input, 'utf8').toString('base64url');
}

function fromBase64Url(input: string) {
    return Buffer.from(input, 'base64url').toString('utf8');
}

async function getRecoverySecret() {
    const auth = await getAuth();
    const ctx = await auth.$context;
    return ctx.secret;
}

async function signRecoveryPayload(payload: AnonymousRecoveryPayload) {
    const secret = await getRecoverySecret();
    const encodedPayload = toBase64Url(JSON.stringify(payload));
    const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
    return `${encodedPayload}.${signature}`;
}

async function verifyRecoveryToken(token: string): Promise<AnonymousRecoveryPayload | null> {
    const [encodedPayload, providedSignature] = token.split('.');
    if (!encodedPayload || !providedSignature) {
        return null;
    }

    const secret = await getRecoverySecret();
    const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest();
    const providedSignatureBuffer = Buffer.from(providedSignature, 'base64url');

    if (expectedSignature.length !== providedSignatureBuffer.length || !timingSafeEqual(expectedSignature, providedSignatureBuffer)) {
        return null;
    }

    try {
        const payload = JSON.parse(fromBase64Url(encodedPayload)) as AnonymousRecoveryPayload;
        if (payload.version !== ANONYMOUS_RECOVERY_TOKEN_VERSION || !payload.userId) {
            return null;
        }
        return {
            version: ANONYMOUS_RECOVERY_TOKEN_VERSION,
            userId: payload.userId,
            activeOrganizationId: payload.activeOrganizationId ?? null,
        };
    } catch {
        return null;
    }
}

function buildCookieValue(options: { name: string; value: string; maxAge?: number; secure?: boolean }) {
    const parts = [`${options.name}=${options.value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];

    if (typeof options.maxAge === 'number') {
        parts.push(`Max-Age=${options.maxAge}`);
    }

    if (options.secure) {
        parts.push('Secure');
    }

    return parts.join('; ');
}

function getSecureCookieFlag(requestUrl?: string | null) {
    if (!requestUrl) {
        return false;
    }

    try {
        return new URL(requestUrl).protocol === 'https:';
    } catch {
        return false;
    }
}

function readCookie(headers: Headers, cookieName: string) {
    const cookieHeader = headers.get('cookie');
    if (!cookieHeader) {
        return null;
    }

    const cookies = cookieHeader
        .split(';')
        .map(part => part.trim())
        .filter(Boolean);

    for (const cookie of cookies) {
        const separatorIndex = cookie.indexOf('=');
        if (separatorIndex <= 0) {
            continue;
        }

        const name = cookie.slice(0, separatorIndex);
        if (name !== cookieName) {
            continue;
        }

        return cookie.slice(separatorIndex + 1);
    }

    return null;
}

export function getAnonymousRecoveryCookieName() {
    return ANONYMOUS_RECOVERY_COOKIE_NAME;
}

export function appendAnonymousRecoveryCookieHeader(headers: Headers, options: { requestUrl?: string | null; token: string }) {
    headers.append(
        'set-cookie',
        buildCookieValue({
            name: ANONYMOUS_RECOVERY_COOKIE_NAME,
            value: options.token,
            maxAge: ANONYMOUS_RECOVERY_COOKIE_TTL_SECONDS,
            secure: getSecureCookieFlag(options.requestUrl),
        }),
    );
}

export function appendClearAnonymousRecoveryCookieHeader(headers: Headers, requestUrl?: string | null) {
    headers.append(
        'set-cookie',
        buildCookieValue({
            name: ANONYMOUS_RECOVERY_COOKIE_NAME,
            value: '',
            maxAge: 0,
            secure: getSecureCookieFlag(requestUrl),
        }),
    );
}

export async function issueAnonymousRecoveryToken(input: { userId: string; activeOrganizationId?: string | null }) {
    return signRecoveryPayload({
        version: ANONYMOUS_RECOVERY_TOKEN_VERSION,
        userId: input.userId,
        activeOrganizationId: input.activeOrganizationId ?? null,
    });
}

export async function readAnonymousRecoveryPayload(headers: Headers) {
    const token = readCookie(headers, ANONYMOUS_RECOVERY_COOKIE_NAME);
    if (!token) {
        return null;
    }

    return verifyRecoveryToken(token);
}

export async function resolveRecoverableAnonymousUser(token: string | null | undefined) {
    if (!token) {
        return null;
    }

    const payload = await verifyRecoveryToken(token);
    if (payload && shouldProxyAuthRequest()) {
        return payload;
    }
    return resolveRecoverableAnonymousPayload(payload);
}

export async function resolveRecoverableAnonymousPayload(payload: AnonymousRecoveryPayload | null | undefined) {
    if (!payload) {
        return null;
    }

    const db = await getClient();
    const [user] = await db
        .select({
            id: schema.user.id,
            isAnonymous: schema.user.isAnonymous,
        })
        .from(schema.user)
        .where(eq(schema.user.id, payload.userId))
        .limit(1);

    if (!user?.isAnonymous) {
        return null;
    }

    return payload;
}
