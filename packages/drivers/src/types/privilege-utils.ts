export type ScopedPrivilegeScope = 'database' | 'table' | 'view';

export const DISPLAY_PRIVILEGES = ['GRANT', 'SELECT', 'INSERT', 'ALTER', 'CREATE', 'DROP'] as const;
export type DisplayPrivilege = (typeof DISPLAY_PRIVILEGES)[number];
export const DISPLAY_PRIVILEGE_SET = new Set<string>(DISPLAY_PRIVILEGES);

export const GLOBAL_PRIVILEGE_OPTIONS = DISPLAY_PRIVILEGES;

const DATABASE_SCOPE_BASE = ['GRANT', 'SELECT', 'INSERT', 'ALTER', 'CREATE', 'DROP'] as const;
const TABLE_SCOPE_BASE = ['GRANT', 'SELECT', 'INSERT', 'ALTER', 'CREATE', 'DROP'] as const;
const VIEW_SCOPE_BASE = ['GRANT', 'SELECT', 'ALTER', 'DROP'] as const;

const TABLE_SCOPE_REMAP = new Map<string, string>([
    ['ALTER', 'ALTER TABLE'],
    ['CREATE', 'CREATE TABLE'],
    ['DROP', 'DROP TABLE'],
]);

const VIEW_SCOPE_REMAP = new Map<string, string>([
    ['ALTER', 'ALTER VIEW'],
    ['DROP', 'DROP VIEW'],
]);

function remapList(values: readonly string[], scope: ScopedPrivilegeScope): string[] {
    return remapPrivilegesForScope([...values], scope);
}

export const DATABASE_PRIVILEGES = remapList(DATABASE_SCOPE_BASE, 'database') as readonly string[];
export const TABLE_PRIVILEGES = remapList(TABLE_SCOPE_BASE, 'table') as readonly string[];
export const VIEW_PRIVILEGES = remapList(VIEW_SCOPE_BASE, 'view') as readonly string[];

export const DISPLAY_PRIVILEGE_ALIASES: Record<DisplayPrivilege, string[]> = {
    GRANT: ['GRANT'],
    SELECT: ['SELECT'],
    INSERT: ['INSERT'],
    ALTER: ['ALTER', 'ALTER TABLE', 'ALTER VIEW'],
    CREATE: ['CREATE', 'CREATE TABLE', 'CREATE VIEW'],
    DROP: ['DROP', 'DROP TABLE', 'DROP VIEW'],
};

function getScopeRemap(scope: ScopedPrivilegeScope): Map<string, string> | null {
    if (scope === 'table') return TABLE_SCOPE_REMAP;
    if (scope === 'view') return VIEW_SCOPE_REMAP;
    return null;
}

function dedupe(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const upper = value.trim().toUpperCase();
        if (!upper.length || seen.has(upper)) continue;
        seen.add(upper);
        result.push(upper);
    }
    return result;
}

export function remapPrivilegesForScope(privileges: string[], scope: ScopedPrivilegeScope): string[] {
    if (!privileges.length) return privileges;
    const remap = getScopeRemap(scope);
    if (!remap) return dedupe(privileges);
    return dedupe(privileges.map(privilege => remap.get(privilege) ?? privilege));
}

export function hasPrivilegeForDisplay(privileges: Record<string, boolean>, column: DisplayPrivilege): boolean {
    const aliases = DISPLAY_PRIVILEGE_ALIASES[column] ?? [column];
    return aliases.some(alias => privileges[alias]);
}

export function formatPrivilegeLabelForScope(privilege: string, scope: ScopedPrivilegeScope): string {
    if (scope === 'database') return privilege;
    const suffix = scope === 'table' ? 'TABLE' : 'VIEW';
    const upper = privilege.toUpperCase();
    if (upper.endsWith(` ${suffix}`)) {
        return privilege;
    }
    return `${privilege} ${suffix}`;
}
