import { NextResponse } from 'next/server';
import { serializeSignedCookie } from 'better-call';
import { proxyAuthRequest, shouldProxyAuthRequest } from '@/lib/auth/auth-proxy';
import { getAuth } from '@/lib/auth';
import {
    appendClearAnonymousRecoveryCookieHeader,
    appendAnonymousRecoveryCookieHeader,
    issueAnonymousRecoveryToken,
    readAnonymousRecoveryPayload,
    resolveRecoverableAnonymousPayload,
} from '@/lib/auth/anonymous-recovery';
import { buildSessionOrganizationPatch } from '@/lib/auth/migration-state';
import { isDesktopAuthRequest, resolveSessionLifetime } from '@/lib/auth/session-lifetime';
import { isDesktopRuntime } from '@dory/shared/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    if (shouldProxyAuthRequest()) {
        console.log('[auth][anonymous-recover] proxying request');
        return proxyAuthRequest(req);
    }

    const payload = await readAnonymousRecoveryPayload(req.headers);
    console.log('[auth][anonymous-recover] payload', {
        hasPayload: Boolean(payload),
        userId: payload?.userId ?? null,
        activeOrganizationId: payload?.activeOrganizationId ?? null,
    });
    if (!payload) {
        const response = NextResponse.json({ error: 'ANONYMOUS_RECOVERY_NOT_FOUND' }, { status: 401 });
        appendClearAnonymousRecoveryCookieHeader(response.headers, req.url);
        return response;
    }

    const recoverableUser = await resolveRecoverableAnonymousPayload(payload);
    console.log('[auth][anonymous-recover] recoverable user', {
        recoverable: Boolean(recoverableUser),
        userId: recoverableUser?.userId ?? null,
        activeOrganizationId: recoverableUser?.activeOrganizationId ?? null,
    });
    if (!recoverableUser) {
        const response = NextResponse.json({ error: 'ANONYMOUS_RECOVERY_INVALID' }, { status: 401 });
        appendClearAnonymousRecoveryCookieHeader(response.headers, req.url);
        return response;
    }

    const auth = await getAuth();
    const ctx = await auth.$context;
    const desktopRequest = isDesktopRuntime() || isDesktopAuthRequest(req.headers);
    const lifetime = resolveSessionLifetime({
        desktop: desktopRequest,
    });
    const session = await ctx.internalAdapter.createSession(
        recoverableUser.userId,
        false,
        {
            expiresAt: lifetime.expiresAt,
        },
        true,
    );

    if (!session) {
        return NextResponse.json({ error: 'FAILED_TO_CREATE_SESSION' }, { status: 500 });
    }

    const sessionPatch = buildSessionOrganizationPatch({
        activeOrganizationId: recoverableUser.activeOrganizationId,
    });
    if (sessionPatch) {
        await ctx.internalAdapter.updateSession(session.token, sessionPatch);
    }

    const baseAttrs = ctx.authCookies.sessionToken.attributes ?? {};
    const sessionCookie = await serializeSignedCookie(ctx.authCookies.sessionToken.name, session.token, ctx.secret, {
        ...baseAttrs,
        maxAge: lifetime.cookieMaxAgeSeconds,
    });

    const response = NextResponse.json({ success: true });
    response.headers.append('set-cookie', sessionCookie);
    const refreshedRecoveryToken = await issueAnonymousRecoveryToken({
        userId: recoverableUser.userId,
        activeOrganizationId: recoverableUser.activeOrganizationId,
    });
    appendAnonymousRecoveryCookieHeader(response.headers, {
        ...(desktopRequest
            ? {
                  maxAgeSeconds: lifetime.cookieMaxAgeSeconds,
              }
            : {}),
        requestUrl: req.url,
        token: refreshedRecoveryToken,
    });
    console.log('[auth][anonymous-recover] issued local session', {
        userId: recoverableUser.userId,
        activeOrganizationId: recoverableUser.activeOrganizationId ?? null,
    });
    return response;
}

export async function DELETE(req: Request) {
    const response = NextResponse.json({ success: true });
    appendClearAnonymousRecoveryCookieHeader(response.headers, req.url);
    return response;
}
