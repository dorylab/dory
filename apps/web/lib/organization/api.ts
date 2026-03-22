'use client';

import type { OrganizationRole } from '@/types/organization';

type FetchMethod = 'GET' | 'POST';

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

async function authOrganizationRequest<T>(
    path: string,
    options?: {
        method?: FetchMethod;
        body?: Record<string, unknown>;
        query?: Record<string, string | number | boolean | null | undefined>;
    },
): Promise<T> {
    const method = options?.method ?? 'GET';
    const url = new URL(`/api/auth${path}`, window.location.origin);

    for (const [key, value] of Object.entries(options?.query ?? {})) {
        if (value === null || value === undefined || value === '') continue;
        url.searchParams.set(key, String(value));
    }

    const response = await fetch(url.toString(), {
        method,
        headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
        body: options?.body ? JSON.stringify(options.body) : undefined,
        credentials: 'include',
    });

    return parseResponse<T>(response);
}

async function appApiRequest<T>(
    path: string,
    options?: {
        method?: FetchMethod;
        body?: Record<string, unknown>;
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
        headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
        body: options?.body ? JSON.stringify(options.body) : undefined,
        credentials: 'include',
    });

    return parseResponse<T>(response);
}

export type OrganizationSummary = {
    id: string;
    name: string;
    slug: string;
    logo?: string | null;
    metadata?: Record<string, unknown> | null;
    createdAt: string | Date;
};

export type OrganizationMember = {
    id: string;
    organizationId: string;
    userId: string;
    role: OrganizationRole;
    createdAt: string | Date;
    status?: string | null;
    joinedAt?: string | Date | null;
    user: {
        id: string;
        name: string;
        email: string;
        image?: string | null;
    };
};

export type OrganizationInvitation = {
    id: string;
    organizationId: string;
    email: string;
    role: OrganizationRole;
    status: string;
    inviterId: string;
    expiresAt: string | Date;
    createdAt: string | Date;
    organizationName?: string;
    organizationSlug?: string;
};

export type OrganizationFull = OrganizationSummary & {
    members: OrganizationMember[];
    invitations: OrganizationInvitation[];
    ownerUserId?: string | null;
};

export type OrganizationAccessSummary = {
    source: 'desktop' | 'local';
    organizationId: string;
    userId: string;
    isMember: boolean;
    role: OrganizationRole | null;
    permissions: {
        organization: { read: boolean; update: boolean; delete: boolean };
        member: { read: boolean; create: boolean; update: boolean; delete: boolean };
        invitation: { read: boolean; create: boolean; cancel: boolean };
        workspace: { read: boolean; write: boolean };
        connection: { read: boolean; create: boolean; update: boolean; delete: boolean };
    };
    organization: {
        id: string;
        slug?: string | null;
        name?: string | null;
    } | null;
};

export function slugifyOrganizationName(name: string) {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'workspace';
}

export async function listOrganizations() {
    return authOrganizationRequest<OrganizationSummary[]>('/organization/list');
}

export async function createOrganization(input: { name: string; slug: string }) {
    return authOrganizationRequest<OrganizationFull>('/organization/create', {
        method: 'POST',
        body: {
            name: input.name,
            slug: input.slug,
            keepCurrentActiveOrganization: false,
        },
    });
}

export async function setActiveOrganization(input: { organizationId?: string; organizationSlug?: string }) {
    return authOrganizationRequest<{ organizationId: string | null }>('/organization/set-active', {
        method: 'POST',
        body: input,
    });
}

export async function getFullOrganization(query?: { organizationId?: string; organizationSlug?: string }) {
    return authOrganizationRequest<OrganizationFull | null>('/organization/get-full-organization', {
        query,
    });
}

export async function updateOrganization(input: { organizationId: string; name: string; slug: string }) {
    return authOrganizationRequest<OrganizationSummary | null>('/organization/update', {
        method: 'POST',
        body: {
            organizationId: input.organizationId,
            data: {
                name: input.name,
                slug: input.slug,
            },
        },
    });
}

export async function listMembers(query?: { organizationId?: string; organizationSlug?: string }) {
    return authOrganizationRequest<{ members: OrganizationMember[]; total: number }>('/organization/list-members', {
        query,
    });
}

export async function inviteMember(input: { organizationId: string; email: string; role: OrganizationRole }) {
    return authOrganizationRequest<OrganizationInvitation>('/organization/invite-member', {
        method: 'POST',
        body: input,
    });
}

export async function updateMemberRole(input: { organizationId: string; memberId: string; role: OrganizationRole }) {
    return authOrganizationRequest<OrganizationMember>('/organization/update-member-role', {
        method: 'POST',
        body: input,
    });
}

export async function removeMember(input: { organizationId: string; memberIdOrEmail: string }) {
    return authOrganizationRequest<{ member: OrganizationMember }>('/organization/remove-member', {
        method: 'POST',
        body: input,
    });
}

export async function listInvitations(query?: { organizationId?: string }) {
    return authOrganizationRequest<OrganizationInvitation[]>('/organization/list-invitations', {
        query,
    });
}

export async function listUserInvitations(query?: { email?: string }) {
    return authOrganizationRequest<OrganizationInvitation[]>('/organization/list-user-invitations', {
        query,
    });
}

export async function cancelInvitation(input: { invitationId: string }) {
    return authOrganizationRequest<{ success?: boolean }>('/organization/cancel-invitation', {
        method: 'POST',
        body: input,
    });
}

export async function acceptInvitation(input: { invitationId: string }) {
    return authOrganizationRequest<{ success?: boolean }>('/organization/accept-invitation', {
        method: 'POST',
        body: input,
    });
}

export async function rejectInvitation(input: { invitationId: string }) {
    return authOrganizationRequest<{ success?: boolean }>('/organization/reject-invitation', {
        method: 'POST',
        body: input,
    });
}

export async function getOrganizationAccess(organizationId?: string) {
    const response = await appApiRequest<{ code: number; data?: { access?: OrganizationAccessSummary } }>('/api/organization/access', {
        query: { organizationId },
    });

    if (response.code !== 0 || !response.data?.access) {
        throw new Error('Failed to resolve organization access');
    }

    return response.data.access;
}
