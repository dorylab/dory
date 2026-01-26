export type FormMode = 'create' | 'edit';

export type UserFormValues = {
    name: string;
    password: string;
    allowedHosts: string;
    roles: string[];
    defaultRole: string | null;
    onCluster: boolean;
    cluster: string | null;
};

export type RolePrivilegeField = {
    privilege: string;
    database: string;
    table: string;
    columns: string;
    grantOption: boolean;
};

export type RoleFormValues = {
    name: string;
    privileges: RolePrivilegeField[];
    onCluster: boolean;
    cluster: string | null;
};
