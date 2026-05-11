export type OrganizationRole = 'owner' | 'admin' | 'member' | 'viewer';

export type OrganizationPermissionResource =
    | 'organization'
    | 'member'
    | 'invitation'
    | 'workspace'
    | 'connection';

export type OrganizationPermissionAction =
    | 'read'
    | 'create'
    | 'update'
    | 'delete'
    | 'cancel'
    | 'write';

export type OrganizationPermissionMap = {
    organization: {
        read: boolean;
        update: boolean;
        delete: boolean;
    };
    member: {
        read: boolean;
        create: boolean;
        update: boolean;
        delete: boolean;
    };
    invitation: {
        read: boolean;
        create: boolean;
        cancel: boolean;
    };
    workspace: {
        read: boolean;
        write: boolean;
    };
    connection: {
        read: boolean;
        create: boolean;
        update: boolean;
        delete: boolean;
    };
};

