import { createHmac, timingSafeEqual } from 'node:crypto';
import { serializeSignedCookie } from 'better-call';
import { eq } from 'drizzle-orm';
import { getAuth } from '@/lib/auth';
import { createAuthProxyHeaders } from '@/lib/auth/auth-proxy';
import { schema } from '@/lib/database/schema';
import { getClient } from '@/lib/database/postgres/client';
import { getCloudApiBaseUrl } from '@/lib/cloud/url';
import { isOrganizationRole, type OrganizationRoleKey } from '@/lib/auth/organization-ac';

const DESKTOP_SESSION_COOKIE_NAME = 'dory.desktop_session_token';
const DESKTOP_SESSION_COOKIE_TTL_SECONDS = 60 * 60 * 24 * 30;
const DESKTOP_SESSION_COOKIE_VERSION = 1;

type CloudSessionLike = {
    session?: {
        activeOrganizationId?: string | null;
    } | null;
    user?: {
        id?: string | null;
        email?: string | null;
        name?: string | null;
        image?: string | null;
        emailVerified?: boolean;
        isAnonymous?: boolean;
    } | null;
};

type OrganizationAccessPayload = {
    organization?: {
        id?: string | null;
        slug?: string | null;
        name?: string | null;
    } | null;
    role?: string | null;
    isMember?: boolean;
} | null;

type DesktopSessionRecoveryPayload = {
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

function getSetCookies(headers: Headers): string[] {
    const anyHeaders = headers as unknown as { getSetCookie?: () => string[] };
    if (typeof anyHeaders.getSetCookie === 'function') {
        return anyHeaders.getSetCookie();
    }

    const raw = headers.get('set-cookie');
    if (!raw) return [];
    return [raw];
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

function rewriteCookieSecurity(value: string, isSecureRequest: boolean): string {
    if (isSecureRequest) {
        return value;
    }

    return value
        .split(';')
        .map(part => part.trim())
        .filter(part => part && !/^secure$/i.test(part))
        .join('; ');
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

function normalizeCookieName(name: string): string[] {
    const baseName = name.replace(/^__Secure-/, '').replace(/^__Host-/, '');
    return Array.from(new Set([baseName, `__Secure-${baseName}`, `__Host-${baseName}`]));
}

function readCookieValueFromSetCookie(setCookie: string, name: string): string | null {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = setCookie.match(new RegExp(`^${escapedName}=([^;]+)`));
    return match?.[1] ?? null;
}

function extractSessionCookieFromSetCookieHeaders(headers: Headers, cookieName: string): { name: string; value: string } | null {
    const cookieNames = normalizeCookieName(cookieName);
    for (const cookie of getSetCookies(headers)) {
        for (const name of cookieNames) {
            const value = readCookieValueFromSetCookie(cookie, name);
            if (value) return { name, value };
        }
    }
    return null;
}

async function getRecoverySecret() {
    const auth = await getAuth();
    const ctx = await auth.$context;
    return ctx.secret;
}

async function signRecoveryPayload(payload: DesktopSessionRecoveryPayload) {
    const secret = await getRecoverySecret();
    const encodedPayload = toBase64Url(JSON.stringify(payload));
    const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
    return `${encodedPayload}.${signature}`;
}

async function verifyRecoveryToken(token: string): Promise<DesktopSessionRecoveryPayload | null> {
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
        const payload = JSON.parse(fromBase64Url(encodedPayload)) as DesktopSessionRecoveryPayload;
        if (payload.version !== DESKTOP_SESSION_COOKIE_VERSION || !payload.userId) {
            return null;
        }

        return {
            version: DESKTOP_SESSION_COOKIE_VERSION,
            userId: payload.userId,
            activeOrganizationId: payload.activeOrganizationId ?? null,
        };
    } catch {
        return null;
    }
}

async function fetchCloudSessionDetails(req: Request, responseHeaders: Headers): Promise<{
    cloudSession: CloudSessionLike;
    access: OrganizationAccessPayload;
} | null> {
    const baseUrl = getCloudApiBaseUrl();
    if (!baseUrl) {
        return null;
    }

    const auth = await getAuth();
    const ctx = await auth.$context;
    const sessionCookie = extractSessionCookieFromSetCookieHeaders(responseHeaders, ctx.authCookies.sessionToken.name);
    if (!sessionCookie) {
        return null;
    }

    const headers = createAuthProxyHeaders(req.headers, baseUrl);
    const existingCookie = headers.get('cookie');
    const nextCookie = `${sessionCookie.name}=${sessionCookie.value}`;
    headers.set('cookie', existingCookie ? `${existingCookie}; ${nextCookie}` : nextCookie);

    const sessionResponse = await fetch(new URL('/api/auth/get-session', baseUrl).toString(), {
        headers,
        cache: 'no-store',
    }).catch(() => null);

    if (!sessionResponse?.ok) {
        return null;
    }

    const cloudSession = (await sessionResponse.json().catch(() => null)) as CloudSessionLike | null;
    if (!cloudSession) {
        return null;
    }

    const userId = cloudSession?.user?.id ?? null;
    if (!userId) {
        return null;
    }
    const resolvedCloudSession: CloudSessionLike = cloudSession;

    const activeOrganizationId = resolvedCloudSession.session?.activeOrganizationId ?? null;
    if (!activeOrganizationId) {
        return {
            cloudSession: resolvedCloudSession,
            access: null,
        };
    }

    const accessResponse = await fetch(new URL(`/api/organization/access?organizationId=${encodeURIComponent(activeOrganizationId)}`, baseUrl).toString(), {
        headers,
        cache: 'no-store',
    }).catch(() => null);

    if (!accessResponse?.ok) {
        return {
            cloudSession: resolvedCloudSession,
            access: null,
        };
    }

    const accessPayload = (await accessResponse.json().catch(() => null)) as
        | { code?: number; data?: { access?: OrganizationAccessPayload } }
        | null;

    return {
        cloudSession: resolvedCloudSession,
        access: accessPayload?.code === 0 ? (accessPayload.data?.access ?? null) : null,
    };
}

async function ensureLocalDesktopUserState(input: {
    cloudSession: CloudSessionLike;
    access: OrganizationAccessPayload;
}) {
    const db = await getClient();
    const user = input.cloudSession.user;
    const session = input.cloudSession.session;
    const userId = user?.id ?? null;

    if (!userId) {
        throw new Error('missing_cloud_user');
    }

    const now = new Date();

    await db
        .insert(schema.user)
        .values({
            id: userId,
            name: user?.name ?? user?.email ?? userId,
            email: user?.email ?? `${userId}@local.invalid`,
            image: user?.image ?? null,
            emailVerified: Boolean(user?.emailVerified),
            isAnonymous: false,
            lastActiveAt: now,
            updatedAt: now,
        })
        .onConflictDoUpdate({
            target: schema.user.id,
            set: {
                name: user?.name ?? user?.email ?? userId,
                email: user?.email ?? `${userId}@local.invalid`,
                image: user?.image ?? null,
                emailVerified: Boolean(user?.emailVerified),
                isAnonymous: false,
                lastActiveAt: now,
                updatedAt: now,
            },
        });

    const organization = input.access?.organization;
    const organizationId = organization?.id ?? session?.activeOrganizationId ?? null;
    const role = isOrganizationRole(input.access?.role) ? input.access.role : null;
    const isMember = input.access?.isMember ?? false;

    if (organizationId) {
        await db
            .insert(schema.organizations)
            .values({
                id: organizationId,
                name: organization?.name ?? organizationId,
                slug: organization?.slug ?? organizationId,
                ownerUserId: userId,
                updatedAt: now,
            })
            .onConflictDoUpdate({
                target: schema.organizations.id,
                set: {
                    name: organization?.name ?? organizationId,
                    slug: organization?.slug ?? organizationId,
                    updatedAt: now,
                },
            });
    }

    if (organizationId && isMember && role) {
        await db
            .insert(schema.organizationMembers)
            .values({
                userId,
                organizationId,
                role: role as OrganizationRoleKey,
                status: 'active',
                joinedAt: now,
            })
            .onConflictDoUpdate({
                target: [schema.organizationMembers.organizationId, schema.organizationMembers.userId],
                set: {
                    role: role as OrganizationRoleKey,
                    status: 'active',
                    joinedAt: now,
                },
            });
    }
}

export function getDesktopSessionCookieName() {
    return DESKTOP_SESSION_COOKIE_NAME;
}

export function appendClearDesktopSessionCookieHeader(headers: Headers, requestUrl?: string | null) {
    headers.append(
        'set-cookie',
        buildCookieValue({
            name: DESKTOP_SESSION_COOKIE_NAME,
            value: '',
            maxAge: 0,
            secure: getSecureCookieFlag(requestUrl),
        }),
    );
}

export async function issueDesktopSessionRecoveryToken(input: { userId: string; activeOrganizationId?: string | null }) {
    return signRecoveryPayload({
        version: DESKTOP_SESSION_COOKIE_VERSION,
        userId: input.userId,
        activeOrganizationId: input.activeOrganizationId ?? null,
    });
}

export async function readDesktopSessionRecoveryPayload(headers: Headers) {
    const token = readCookie(headers, DESKTOP_SESSION_COOKIE_NAME);
    if (!token) {
        return null;
    }

    return verifyRecoveryToken(token);
}

export async function buildDesktopSessionCookie(sessionToken: string, requestUrl?: string | null) {
    const auth = await getAuth();
    const ctx = await auth.$context;
    const maxAge = ctx.sessionConfig?.expiresIn ?? DESKTOP_SESSION_COOKIE_TTL_SECONDS;
    const rawCookie = await serializeSignedCookie(DESKTOP_SESSION_COOKIE_NAME, sessionToken, ctx.secret, {
        ...(ctx.authCookies.sessionToken.attributes ?? {}),
        maxAge,
    });
    return rewriteCookieSecurity(rawCookie, getSecureCookieFlag(requestUrl));
}

export async function mirrorCloudSessionToDesktop(req: Request, responseHeaders: Headers): Promise<string | null> {
    const details = await fetchCloudSessionDetails(req, responseHeaders);
    if (!details?.cloudSession?.user?.id) {
        return null;
    }

    await ensureLocalDesktopUserState(details);

    const auth = await getAuth();
    const ctx = await auth.$context;
    const localSession = await ctx.internalAdapter.createSession(details.cloudSession.user.id, false);
    if (!localSession) {
        return null;
    }

    const activeOrganizationId = details.cloudSession.session?.activeOrganizationId ?? null;
    if (activeOrganizationId) {
        await ctx.internalAdapter.updateSession(localSession.token, {
            activeOrganizationId,
        });
    }

    return buildDesktopSessionCookie(localSession.token, req.url);
}

export async function resolveDesktopRecoveredSession(headers: Headers) {
    const payload = await readDesktopSessionRecoveryPayload(headers);
    if (!payload?.userId) {
        return null;
    }

    const db = await getClient();
    const [user] = await db
        .select({
            id: schema.user.id,
        })
        .from(schema.user)
        .where(eq(schema.user.id, payload.userId))
        .limit(1);

    if (!user?.id) {
        return null;
    }

    const auth = await getAuth();
    const ctx = await auth.$context;
    const localSession = await ctx.internalAdapter.createSession(payload.userId, false);
    if (!localSession) {
        return null;
    }

    if (payload.activeOrganizationId) {
        await ctx.internalAdapter.updateSession(localSession.token, {
            activeOrganizationId: payload.activeOrganizationId,
        });
    }

    const localCookie = await buildDesktopSessionCookie(localSession.token);
    const cookieValue = readCookieValueFromSetCookie(localCookie, DESKTOP_SESSION_COOKIE_NAME);
    if (!cookieValue) {
        return null;
    }

    const requestHeaders = new Headers(headers);
    const cookieHeader = requestHeaders.get('cookie');
    const baseCookie = `${ctx.authCookies.sessionToken.name}=${cookieValue}`;
    const secureCookie = `__Secure-${ctx.authCookies.sessionToken.name.replace(/^__Secure-/, '')}=${cookieValue}`;
    requestHeaders.set('cookie', cookieHeader ? `${cookieHeader}; ${baseCookie}; ${secureCookie}` : `${baseCookie}; ${secureCookie}`);

    return auth.api.getSession({
        headers: requestHeaders,
    }).catch(() => null);
}
