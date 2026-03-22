'use client';

import { authClient } from '@/lib/auth-client';
import type { OrganizationBillingStatus } from './types';

type FetchMethod = 'GET' | 'POST';

type StripeRedirectResponse = {
    url?: string | null;
    redirect?: boolean;
};

async function parseResponse<T>(response: Response): Promise<T> {
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        const message =
            (payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string' && payload.message) ||
            (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' && payload.error) ||
            'Request failed';
        throw new Error(message);
    }

    return payload as T;
}

async function appApiRequest<T>(
    path: string,
    options?: {
        method?: FetchMethod;
        query?: Record<string, string | number | boolean | null | undefined>;
    },
): Promise<T> {
    const method = options?.method ?? 'GET';
    const url = new URL(path, window.location.origin);

    for (const [key, value] of Object.entries(options?.query ?? {})) {
        if (value === null || value === undefined || value === '') continue;
        url.searchParams.set(key, String(value));
    }

    const response = await fetch(url.toString(), {
        method,
        credentials: 'include',
    });

    return parseResponse<T>(response);
}

function getBillingReturnUrl(organizationSlug: string) {
    return `/${organizationSlug}/settings/billing`;
}

function resolveStripeError(error: unknown): Error {
    if (error instanceof Error) {
        return error;
    }

    return new Error('Billing request failed');
}

function assertRedirectUrl(result: { data?: StripeRedirectResponse | null; error?: { message?: string | null } | null }) {
    if (result.error) {
        throw new Error(result.error.message || 'Billing request failed');
    }

    const url = result.data?.url;
    if (!url) {
        throw new Error('Stripe did not return a redirect URL');
    }

    window.location.assign(url);
}

export async function getOrganizationBillingStatus(organizationId: string): Promise<OrganizationBillingStatus> {
    const response = await appApiRequest<{ code: number; data?: { billingStatus?: OrganizationBillingStatus } }>('/api/organization/billing', {
        query: { organizationId },
    });

    if (response.code !== 0 || !response.data?.billingStatus) {
        throw new Error('Failed to load billing status');
    }

    return response.data.billingStatus;
}

export async function upgradeOrganizationToPro(organizationId: string, organizationSlug: string) {
    try {
        const returnUrl = getBillingReturnUrl(organizationSlug);
        const result = await authClient.subscription.upgrade({
            plan: 'pro',
            referenceId: organizationId,
            customerType: 'organization',
            successUrl: returnUrl,
            cancelUrl: returnUrl,
            returnUrl,
            disableRedirect: true,
        });

        assertRedirectUrl(result);
    } catch (error) {
        throw resolveStripeError(error);
    }
}

export async function openOrganizationBillingPortal(organizationId: string, organizationSlug: string, _subscriptionId: string) {
    try {
        const result = await authClient.subscription.billingPortal({
            referenceId: organizationId,
            customerType: 'organization',
            returnUrl: getBillingReturnUrl(organizationSlug),
            disableRedirect: true,
        });

        assertRedirectUrl(result);
    } catch (error) {
        throw resolveStripeError(error);
    }
}
