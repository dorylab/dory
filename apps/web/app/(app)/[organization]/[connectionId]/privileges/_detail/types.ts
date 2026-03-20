import type { RolePrivilege } from '@/types/privileges';

export type PrivilegeNodeType = 'root' | 'database' | 'table' | 'view' | 'column';

export type RolePrivilegeWithSource = RolePrivilege & { source: string };

export type PrivilegeTreeNode = {
    id: string;
    name: string;
    type: PrivilegeNodeType;
    depth: number;
    hasAll: boolean;
    hasGrant: boolean;
    privileges: Record<string, boolean>;
    directPrivileges: string[];
    path: string[];
    children: PrivilegeTreeNode[];
};

export type PrivilegeTreeData = {
    nodes: PrivilegeTreeNode[];
    columns: string[];
    global: {
        hasAll: boolean;
        hasGrant: boolean;
        privileges: Record<string, boolean>;
    };
};

export type SelectOption = { label: string; value: string };

export type ScopedContext = { scope: 'database' | 'table' | 'view'; database: string; object?: string };
