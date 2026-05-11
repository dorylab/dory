export type ClickHouseUser = {
    name: string;
    hostName?: string | null;
    authType?: string | null;
    defaultRoles: string[];
    grantedRoles: string[];
    globalPrivileges: string[];
    directPrivileges: RolePrivilege[];
    allowAllHosts?: boolean;
    allowedClientHosts?: string[];
};

export type ClickHouseRole = {
    name: string;
    privileges: RolePrivilege[];
    grantedToUsers: string[];
    grantedToRoles: string[];
};

export type RolePrivilege = {
    privilege: string;
    database?: string | null;
    table?: string | null;
    columns?: string[] | null;
    grantOption?: boolean;
};

export type CreateUserPayload = {
    name: string;
    password?: string;
    allowAllHosts?: boolean;
    allowedClientHosts?: string[];
    roles?: string[];
    defaultRoles?: string[];
    cluster?: string;
};

export type UpdateUserPayload = {
    name: string;
    newName?: string;
    password?: string | null;
    allowAllHosts?: boolean;
    allowedClientHosts?: string[];
    roles?: string[];
    defaultRoles?: string[];
    cluster?: string;
};

export type DeleteUserPayload = {
    name: string;
};

export type CreateRolePayload = {
    name: string;
    privileges?: RolePrivilege[];
    cluster?: string;
};

export type UpdateRolePayload = {
    name: string;
    newName?: string;
    privileges?: RolePrivilege[];
    cluster?: string;
};

export type DeleteRolePayload = {
    name: string;
};
