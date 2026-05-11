import { createAccessControl } from 'better-auth/plugins';
import type { OrganizationPermissionMap, OrganizationRole } from '@dory/shared/types/organization';

export const organizationAc = createAccessControl({
    organization: ['read', 'update', 'delete'],
    member: ['read', 'create', 'update', 'delete'],
    invitation: ['read', 'create', 'cancel'],
    workspace: ['read', 'write'],
    connection: ['read', 'create', 'update', 'delete'],
} as const);

export const organizationRoles = {
    owner: organizationAc.newRole({
        organization: ['read', 'update', 'delete'],
        member: ['read', 'create', 'update', 'delete'],
        invitation: ['read', 'create', 'cancel'],
        workspace: ['read', 'write'],
        connection: ['read', 'create', 'update', 'delete'],
    }),
    admin: organizationAc.newRole({
        organization: ['read', 'update'],
        member: ['read', 'create', 'update', 'delete'],
        invitation: ['read', 'create', 'cancel'],
        workspace: ['read', 'write'],
        connection: ['read', 'create', 'update', 'delete'],
    }),
    member: organizationAc.newRole({
        organization: ['read'],
        member: ['read'],
        invitation: ['read'],
        workspace: ['read', 'write'],
        connection: ['read'],
    }),
    viewer: organizationAc.newRole({
        organization: ['read'],
        member: ['read'],
        invitation: ['read'],
        workspace: ['read'],
        connection: ['read'],
    }),
} as const;

export type OrganizationRoleKey = keyof typeof organizationRoles;

export function isOrganizationRole(value: string | null | undefined): value is OrganizationRole {
    return value === 'owner' || value === 'admin' || value === 'member' || value === 'viewer';
}

export function hasOrganizationRolePermission(
    role: string | null | undefined,
    permissions: {
        [K in keyof typeof organizationAc.statements]?: readonly (typeof organizationAc.statements)[K][number][];
    },
): boolean {
    if (!isOrganizationRole(role)) {
        return false;
    }

    return organizationRoles[role].authorize(permissions).success;
}

export function getOrganizationPermissionMap(role: string | null | undefined): OrganizationPermissionMap {
    return {
        organization: {
            read: hasOrganizationRolePermission(role, { organization: ['read'] }),
            update: hasOrganizationRolePermission(role, { organization: ['update'] }),
            delete: hasOrganizationRolePermission(role, { organization: ['delete'] }),
        },
        member: {
            read: hasOrganizationRolePermission(role, { member: ['read'] }),
            create: hasOrganizationRolePermission(role, { member: ['create'] }),
            update: hasOrganizationRolePermission(role, { member: ['update'] }),
            delete: hasOrganizationRolePermission(role, { member: ['delete'] }),
        },
        invitation: {
            read: hasOrganizationRolePermission(role, { invitation: ['read'] }),
            create: hasOrganizationRolePermission(role, { invitation: ['create'] }),
            cancel: hasOrganizationRolePermission(role, { invitation: ['cancel'] }),
        },
        workspace: {
            read: hasOrganizationRolePermission(role, { workspace: ['read'] }),
            write: hasOrganizationRolePermission(role, { workspace: ['write'] }),
        },
        connection: {
            read: hasOrganizationRolePermission(role, { connection: ['read'] }),
            create: hasOrganizationRolePermission(role, { connection: ['create'] }),
            update: hasOrganizationRolePermission(role, { connection: ['update'] }),
            delete: hasOrganizationRolePermission(role, { connection: ['delete'] }),
        },
    };
}

export function canManageOrganizationRole(role: string | null | undefined): boolean {
    return hasOrganizationRolePermission(role, {
        member: ['create'],
        invitation: ['create'],
    });
}
