import { DISPLAY_PRIVILEGES } from '@/shared/privileges';

import type {
    PrivilegeNodeType,
    PrivilegeTreeData,
    PrivilegeTreeNode,
    RolePrivilegeWithSource,
    ScopedContext,
} from './types';

type MutablePrivilegeNode = {
    key: string;
    name: string;
    type: PrivilegeNodeType;
    path: string[];
    hasAll: boolean;
    hasGrant: boolean;
    privileges: Set<string>;
    directPrivileges: Set<string>;
    children: Map<string, MutablePrivilegeNode>;
};

export function normalizeScope(value?: string | null, fallbackLabel?: string) {
    const trimmed = value?.trim();
    if (!trimmed || trimmed === '*') return fallbackLabel ?? '*';
    return trimmed;
}

export function buildPrivilegeTree(
    entries: RolePrivilegeWithSource[],
    options?: { labels?: { root?: string; allDatabases?: string; allTables?: string }; locale?: string },
): PrivilegeTreeData {
    const locale = options?.locale ?? 'en';
    const root: MutablePrivilegeNode = {
        key: 'root',
        name: options?.labels?.root ?? 'Data',
        type: 'root',
        path: [],
        hasAll: false,
        hasGrant: false,
        privileges: new Set(),
        directPrivileges: new Set(),
        children: new Map(),
    };

    const globalPrivileges = {
        hasAll: false,
        hasGrant: false,
        privileges: new Set<string>(),
    };

    const ensureChild = (
        parent: MutablePrivilegeNode,
        type: PrivilegeNodeType,
        displayName: string,
        segment: string,
    ): MutablePrivilegeNode => {
        const path = [...parent.path, segment];
        const key = path.join('::');
        let node = parent.children.get(key);
        if (!node) {
            node = {
                key,
                name: displayName,
                type,
                path,
                hasAll: false,
                hasGrant: false,
                privileges: new Set(),
                directPrivileges: new Set(),
                children: new Map(),
            };
            parent.children.set(key, node);
        }
        return node;
    };

    const applyPrivilege = (
        node: MutablePrivilegeNode,
        privilegeName: string,
        source: string,
        grantOption?: boolean,
    ) => {
        if (privilegeName === 'ALL') {
            node.hasAll = true;
        } else if (privilegeName.length) {
            node.privileges.add(privilegeName);
        }
        if (node.type === 'table' && privilegeName.includes(' VIEW')) {
            node.type = 'view';
        }
        if (grantOption) {
            node.hasGrant = true;
        }
        if (source === 'direct') {
            node.directPrivileges.add(privilegeName);
        }
    };

    const applyGlobalPrivilege = (privilegeName: string, grantOption?: boolean) => {
        if (privilegeName === 'ALL') {
            globalPrivileges.hasAll = true;
        } else if (privilegeName.length) {
            globalPrivileges.privileges.add(privilegeName);
        }
        if (grantOption) {
            globalPrivileges.hasGrant = true;
        }
    };

    for (const entry of entries) {
        const privilegeName = (entry.privilege ?? 'ALL').trim().toUpperCase() || 'ALL';
        const grantOption = entry.grantOption;
        const databaseKey = normalizeScope(entry.database, '*');
        const tableKey = normalizeScope(entry.table, '*');
        const columns = entry.columns?.map(column => column.trim()).filter(Boolean) ?? [];

        if (databaseKey === '*' && tableKey === '*' && columns.length === 0) {
            applyGlobalPrivilege(privilegeName, grantOption);
            continue;
        }

        const databaseNode = ensureChild(
            root,
            'database',
            databaseKey === '*' ? (options?.labels?.allDatabases ?? 'All databases') : databaseKey,
            `database:${databaseKey}`,
        );

        if (tableKey === '*' && columns.length === 0) {
            applyPrivilege(databaseNode, privilegeName, entry.source, grantOption);
            continue;
        }

        const tableNode = ensureChild(
            databaseNode,
            'table',
            tableKey === '*' ? (options?.labels?.allTables ?? 'All tables') : tableKey,
            `table:${tableKey}`,
        );

        if (columns.length === 0) {
            applyPrivilege(tableNode, privilegeName, entry.source, grantOption);
            continue;
        }

        for (const columnName of columns) {
            const columnNode = ensureChild(tableNode, 'column', columnName, `column:${columnName}`);
            applyPrivilege(columnNode, privilegeName, entry.source, grantOption);
        }
    }

    const toImmutable = (node: MutablePrivilegeNode, depth: number): PrivilegeTreeNode => {
        const privilegesRecord: Record<string, boolean> = {};
        node.privileges.forEach(priv => {
            privilegesRecord[priv] = true;
        });
        const children = Array.from(node.children.values()).sort((a, b) =>
            a.name.localeCompare(b.name, locale),
        );
        return {
            id: node.key,
            name: node.name,
            type: node.type,
            depth,
            hasAll: node.hasAll,
            hasGrant: node.hasGrant,
            privileges: privilegesRecord,
            directPrivileges: Array.from(node.directPrivileges),
            path: node.path,
            children: children.map(child => toImmutable(child, depth + 1)),
        };
    };

    const nodes = Array.from(root.children.values())
        .sort((a, b) => a.name.localeCompare(b.name, locale))
        .map(child => toImmutable(child, 0));

    const globalRecord = Array.from(globalPrivileges.privileges.values()).reduce<Record<string, boolean>>(
        (acc, priv) => {
            acc[priv] = true;
            return acc;
        },
        {},
    );

    return {
        nodes,
        columns: DISPLAY_PRIVILEGES.slice(),
        global: {
            hasAll: globalPrivileges.hasAll,
            hasGrant: globalPrivileges.hasGrant,
            privileges: globalRecord,
        },
    };
}

export function getParamValue(value: string | string[] | undefined): string {
    if (!value) return '';
    if (Array.isArray(value)) {
        return value.length > 0 ? value[0] : '';
    }
    return value;
}

export function resolveNodeContext(node: PrivilegeTreeNode): ScopedContext | null {
    if (node.type === 'database') {
        return { scope: 'database', database: node.name };
    }
    if (node.type === 'table' || node.type === 'view') {
        const databaseSegment = node.path.find(segment => segment.startsWith('database:'));
        if (!databaseSegment) return null;
        const database = databaseSegment.replace('database:', '');
        const tableName = node.name;
        if (!database || !tableName || tableName === '*') return null;
        return {
            scope: node.type === 'view' ? 'view' : 'table',
            database,
            object: tableName,
        };
    }
    return null;
}
