// lib/auth/client.ts — only import in client components
'use client';
import { dashClient, sentinelClient } from '@better-auth/infra/client';
import { createAuthClient } from 'better-auth/react';
import { inferOrgAdditionalFields, organizationClient } from 'better-auth/client/plugins';
import { translate } from '@/lib/i18n/i18n';
import { getClientLocale } from '@/lib/i18n/client-locale';
import { getAuthBaseUrl } from '@/lib/client/auth-runtime';
import type { getAuth } from './auth';
import { organizationAc, organizationRoles } from './auth/organization-ac';

const authBaseUrl = getAuthBaseUrl();

export const authClient = createAuthClient({
    // Same origin: omit baseURL
    // Cross-origin (gateway/subdomain): baseURL: process.env.NEXT_PUBLIC_AUTH_ORIGIN,
    ...(authBaseUrl ? { baseURL: authBaseUrl } : {}),
    plugins: [
        dashClient(),
        sentinelClient({
            autoSolveChallenge: true,
        }),
        organizationClient({
            ac: organizationAc,
            roles: organizationRoles,
            schema: inferOrgAdditionalFields<Awaited<ReturnType<typeof getAuth>>>(),
        }),
    ],
});


// ==== Wrapper: social login ====
export function signInViaGithub(redirectTo = '/') {
    // Usually triggers a redirect; return value is not used
    return authClient.signIn.social({
        provider: 'github',
        callbackURL: redirectTo,
        // Recommended: add an error redirect
        errorCallbackURL: '/auth/error',
    });
}

export function signInViaGoogle(redirectTo = '/') {
    // Usually triggers a redirect; return value is not used
    return authClient.signIn.social({
        provider: 'google',
        callbackURL: redirectTo,
        // Recommended: add an error redirect
        errorCallbackURL: '/auth/error',
    });
}

// ==== Sign up ====
export async function signUpViaEmail(name: string, email: string, password: string, redirectTo = '/') {
    // Sign-up usually auto-signs-in (can be disabled server-side)
    return authClient.signUp.email(
        { name, email, password, callbackURL: redirectTo },
        {
            onError: ctx => {
                // Centralized toast/notice
                console.error('signUp error:', ctx.error);
            },
        },
    );
}

// ==== Sign in ====
export async function signInViaEmail(email: string, password: string, redirectTo = '/') {
    return authClient.signIn.email(
        { email, password, callbackURL: redirectTo },
        {
            onError: ctx => {
                const locale = getClientLocale();
                if (ctx.error.status === 403) {
                    // Email verification required if requireEmailVerification is enabled
                    alert(translate(locale, 'Auth.EmailVerifyRequired'));
                }
                alert(ctx.error.message || translate(locale, 'Auth.SignInFailed'));
            },
        },
    );
}

// Optional: destructure directly from the singleton
export const { signIn, signUp, signOut, useSession } = authClient;
