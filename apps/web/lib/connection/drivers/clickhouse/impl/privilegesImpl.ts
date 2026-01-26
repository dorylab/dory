import type {
    ClickHouseRole,
    ClickHouseUser,
    CreateRolePayload,
    CreateUserPayload,
    DeleteRolePayload,
    DeleteUserPayload,
    RolePrivilege,
    UpdateRolePayload,
    UpdateUserPayload,
} from '@/types/privileges';
import { remapPrivilegesForScope, type ScopedPrivilegeScope } from '@/shared/privileges';
import { ClickhouseDatasource } from '../ClickhouseDatasource';

const COLUMN_CACHE = new Map<string, Set<string>>();


function cacheKey(instance: ClickhouseDatasource, table: string): string {
    return `${instance.config.id}:${table}`;
}

async function getTableColumns(instance: ClickhouseDatasource, table: string): Promise<Set<string>> {
    const key = cacheKey(instance, table);
    const cached = COLUMN_CACHE.get(key);
    if (cached) return cached;
    const result = await instance.query<{ name: string }>(`DESCRIBE TABLE ${table}`);
    const columns = new Set((result.rows ?? []).map(row => row.name));
    COLUMN_CACHE.set(key, columns);
    return columns;
}

function quoteIdentifier(value: string): string {
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) return value;
    return `\`${value.replace(/`/g, '``')}\``;
}

function quoteString(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

function normalizeArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map(item => String(item)).filter(Boolean);
    }
    if (typeof value === 'string') {
        if (!value.trim()) return [];
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                return parsed.map(item => String(item)).filter(Boolean);
            }
        } catch {
            return value
                .split(',')
                .map(entry => entry.trim())
                .filter(Boolean);
        }
    }
    return [];
}

function toBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (!normalized) return false;
        return !['0', 'false', 'no'].includes(normalized);
    }
    return Boolean(value);
}

function buildUserColumnExpressions(columns: Set<string>) {
    const hostExpr = columns.has('host_name') ? 'u.host_name' : columns.has('host') ? 'u.host' : 'NULL';
    const authExpr = columns.has('authentication_type') ? 'u.authentication_type' : 'NULL';
    const allowAllExpr = columns.has('allow_all_hosts') ? 'u.allow_all_hosts' : '1';
    const allowedHostsExpr = columns.has('allowed_client_hosts') ? 'u.allowed_client_hosts' : '[]';
    const defaultRolesExpr = columns.has('default_roles_list')
        ? 'u.default_roles_list'
        : columns.has('default_roles')
            ? 'u.default_roles'
            : columns.has('default_roles_all')
                ? 'u.default_roles_all'
                : '[]';
    return { hostExpr, authExpr, allowAllExpr, allowedHostsExpr, defaultRolesExpr };
}

function mapUserRow(row: any, extras?: { globalPrivileges?: string[]; scopedPrivileges?: RolePrivilege[] }): ClickHouseUser {
    const defaultRoles = normalizeArray(row.default_roles);
    const fallbackDefaults = normalizeArray(row.fallback_default_roles);
    const mergedDefaults = defaultRoles.length ? defaultRoles : fallbackDefaults;
    const globalPrivileges = extras?.globalPrivileges ?? [];
    const scopedPrivileges = extras?.scopedPrivileges ?? [];

    return {
        name: row.name,
        hostName: row.host_name ?? null,
        authType: row.authentication_type ?? null,
        allowAllHosts: row.allow_all_hosts === null || row.allow_all_hosts === undefined ? true : toBoolean(row.allow_all_hosts),
        allowedClientHosts: normalizeArray(row.allowed_client_hosts),
        defaultRoles: mergedDefaults,
        grantedRoles: normalizeArray(row.granted_roles),
        globalPrivileges,
        directPrivileges: scopedPrivileges,
    };
}

function resolveRoleGrantSelectors(columns: Set<string>) {
    const roleName = columns.has('granted_role_name') ? 'granted_role_name' : 'role_name';
    const user_name = columns.has('user_name') ? 'user_name' : columns.has('grantee_name') ? 'grantee_name' : 'user_name';
    const defaultFlag = columns.has('granted_role_is_default') ? 'granted_role_is_default' : columns.has('is_default') ? 'is_default' : null;
    const typeColumn = columns.has('grantee_type') ? 'grantee_type' : null;
    return { roleName, user_name, defaultFlag, typeColumn };
}

async function collectRoleGrantRelations(instance: ClickhouseDatasource) {
    const columns = await getTableColumns(instance, 'system.role_grants');
    const { roleName, user_name, typeColumn } = resolveRoleGrantSelectors(columns);
    const typeExpr = typeColumn
        ? `upper(${typeColumn})`
        : columns.has('user_name')
            ? `CASE WHEN ${user_name} != '' THEN 'USER' ELSE 'ROLE' END`
            : `'USER'`;

    const query = `SELECT ${roleName} AS role_name, ${user_name} AS grantee_name, ${typeExpr} AS grantee_type FROM system.role_grants`;
    const result = await instance.query<any>(query);
    return result.rows ?? [];
}

async function collectUserGlobalPrivileges(instance: ClickhouseDatasource, filterNames?: string[]) {
    const grantsColumns = await getTableColumns(instance, 'system.grants');
    const selectParts = ['access_type'];
    if (grantsColumns.has('grantee_name')) {
        selectParts.push('grantee_name');
    } else if (grantsColumns.has('grantee')) {
        selectParts.push('grantee AS grantee_name');
    } else if (grantsColumns.has('user_name')) {
        selectParts.push('user_name AS grantee_name');
    } else {
        selectParts.push('NULL AS grantee_name');
    }
    if (grantsColumns.has('grantee_type')) {
        selectParts.push('grantee_type');
    } else {
        selectParts.push('NULL AS grantee_type');
    }
    selectParts.push(grantsColumns.has('database') ? 'database' : 'NULL AS database');
    selectParts.push(grantsColumns.has('table') ? '`table`' : 'NULL AS table');

    const grantsResult = await instance.query<any>(`SELECT ${selectParts.join(', ')} FROM system.grants`);
    const grantRows = grantsResult.rows ?? [];
    const filterSet = filterNames ? new Set(filterNames) : null;

    const globalMap = new Map<string, Set<string>>();

    for (const row of grantRows) {
        const nameRaw = row.grantee_name;
        if (!nameRaw) continue;
        const name = String(nameRaw);
        if (filterSet && !filterSet.has(name)) continue;

        const typeRaw = 'grantee_type' in row ? row.grantee_type : undefined;
        const type = typeRaw == null ? 'USER' : String(typeRaw).toUpperCase();
        if (type !== 'USER') continue;

        const database = row.database == null ? '*' : String(row.database);
        const table = row.table == null ? '*' : String(row.table);
        const isGlobal =
            (!database || database === '' || database === '*' || database === 'GLOBAL') &&
            (!table || table === '' || table === '*');
        if (!isGlobal) continue;

        const privilegeRaw = row.access_type;
        if (!privilegeRaw) continue;
        const privilege = String(privilegeRaw).toUpperCase();

        if (!globalMap.has(name)) globalMap.set(name, new Set());
        globalMap.get(name)!.add(privilege);
    }

    return globalMap;
}

async function collectUserScopedPrivileges(instance: ClickhouseDatasource, filterNames?: string[]) {
    const grantsColumns = await getTableColumns(instance, 'system.grants');
    const selectParts = ['access_type'];
    if (grantsColumns.has('grantee_name')) {
        selectParts.push('grantee_name');
    } else if (grantsColumns.has('grantee')) {
        selectParts.push('grantee AS grantee_name');
    } else if (grantsColumns.has('user_name')) {
        selectParts.push('user_name AS grantee_name');
    } else {
        selectParts.push('NULL AS grantee_name');
    }
    if (grantsColumns.has('grantee_type')) {
        selectParts.push('grantee_type');
    } else {
        selectParts.push('NULL AS grantee_type');
    }
    selectParts.push(grantsColumns.has('database') ? 'database' : 'NULL AS database');
    selectParts.push(grantsColumns.has('table') ? '`table`' : 'NULL AS table');
    selectParts.push(grantsColumns.has('columns') ? 'columns' : '[] AS columns');
    selectParts.push(grantsColumns.has('is_grantable') ? 'is_grantable' : '0 AS is_grantable');

    const grantsResult = await instance.query<any>(`SELECT ${selectParts.join(', ')} FROM system.grants`);
    const grantRows = grantsResult.rows ?? [];
    const filterSet = filterNames ? new Set(filterNames) : null;

    const scopedMap = new Map<string, RolePrivilege[]>();

    for (const row of grantRows) {
        const nameRaw = row.grantee_name;
        if (!nameRaw) continue;
        const name = String(nameRaw);
        if (filterSet && !filterSet.has(name)) continue;

        const typeRaw = 'grantee_type' in row ? row.grantee_type : undefined;
        const type = typeRaw == null ? 'USER' : String(typeRaw).toUpperCase();
        if (type !== 'USER') continue;

        const privilegeRaw = row.access_type;
        if (!privilegeRaw) continue;
        const privilege = String(privilegeRaw).toUpperCase();

        const databaseRaw = row.database;
        const tableRaw = row.table;
        const database = databaseRaw == null || String(databaseRaw).trim() === '' ? '*' : String(databaseRaw);
        const table = tableRaw == null || String(tableRaw).trim() === '' ? '*' : String(tableRaw);

        const isGlobal =
            (database === '*' || database.toUpperCase() === 'GLOBAL') &&
            (table === '*' || table === '');
        if (isGlobal) continue;

        const columns = normalizeArray(row.columns).length ? normalizeArray(row.columns) : undefined;
        const grantOption = Boolean(row.is_grantable);

        if (!scopedMap.has(name)) scopedMap.set(name, []);
        scopedMap.get(name)!.push({
            privilege,
            database,
            table,
            columns,
            grantOption,
        });
    }

    return scopedMap;
}

const HOST_KEYWORDS = new Set(['ANY', 'NONE', 'LOCAL', 'REGEXP', 'NAME', 'IP', 'LIKE']);

function stripQuotes(value: string): string {
    if (value.length >= 2) {
        const first = value[0];
        const last = value[value.length - 1];
        if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
            return value.slice(1, -1);
        }
    }
    return value;
}

function formatHost(host: string): string | null {
    const trimmed = host.trim();
    if (!trimmed) return null;

    const [firstToken, ...restTokens] = trimmed.split(/\s+/);
    const upperToken = firstToken.toUpperCase();

    if (HOST_KEYWORDS.has(upperToken)) {
        if (upperToken === 'ANY' || upperToken === 'NONE' || upperToken === 'LOCAL') {
            return upperToken;
        }
        const rest = restTokens.join(' ').trim();
        if (!rest) return null;
        return `${upperToken} ${quoteString(stripQuotes(rest))}`;
    }

    if (/^\/.*\/$/.test(trimmed)) {
        return `REGEXP ${quoteString(trimmed.slice(1, -1))}`;
    }

    if (trimmed.includes('%') || trimmed.includes('*')) {
        return `LIKE ${quoteString(stripQuotes(trimmed))}`;
    }

    if (/^[0-9a-fA-F:.]+$/.test(trimmed)) {
        return `IP ${quoteString(stripQuotes(trimmed))}`;
    }

    return `NAME ${quoteString(stripQuotes(trimmed))}`;
}

function buildHostClause(payload: { allowAllHosts?: boolean; allowedClientHosts?: string[] | undefined }): string {
    const allowAny = payload.allowAllHosts !== false;
    const hosts = payload.allowedClientHosts?.map(entry => entry.trim()).filter(Boolean) ?? [];

    if (allowAny && hosts.length === 0) {
        return 'HOST ANY';
    }

    if (hosts.length === 0) {
        return 'HOST ANY';
    }

    const mapped = hosts.map(formatHost).filter((entry): entry is string => Boolean(entry));
    if (!mapped.length) {
        return 'HOST ANY';
    }

    return `HOST ${mapped.join(', ')}`;
}

function applyClusterClause(statement: string, cluster?: string | null): string {
    if (!cluster) return statement;
    return `${statement} ON CLUSTER ${quoteIdentifier(cluster)}`;
}

function normalizeScope(value: string | undefined | null): string {
    if (!value || value === '*') return '*';
    return quoteIdentifier(value);
}

function buildPrivilegeStatement(
    action: 'GRANT' | 'REVOKE',
    privilege: RolePrivilege,
    roleName: string,
    cluster?: string | null,
): string {
    const privilegeName = privilege.privilege || 'ALL';
    const columns = privilege.columns?.length
        ? `(${privilege.columns.map(column => quoteIdentifier(column)).join(', ')})`
        : '';
    const database = normalizeScope(privilege.database);
    const table = normalizeScope(privilege.table);
    const scope = `${database}.${table}`;
    const target = action === 'GRANT' ? `TO ${quoteIdentifier(roleName)}` : `FROM ${quoteIdentifier(roleName)}`;
    const grantOption = action === 'GRANT' && privilege.grantOption ? ' WITH GRANT OPTION' : '';
    const statement = `${action} ${privilegeName}${columns} ON ${scope} ${target}${grantOption}`;
    return applyClusterClause(statement, cluster);
}

function privilegeKey(priv: RolePrivilege): string {
    const cols = priv.columns?.length ? priv.columns.slice().sort().join(',') : '';
    return [priv.privilege ?? 'ALL', priv.database ?? '*', priv.table ?? '*', cols, priv.grantOption ? '1' : '0'].join('|');
}

export async function listClickHouseUsers(instance: ClickhouseDatasource): Promise<ClickHouseUser[]> {
    const userColumns = await getTableColumns(instance, 'system.users');
    const roleGrantColumns = await getTableColumns(instance, 'system.role_grants');
    const { hostExpr, authExpr, allowAllExpr, allowedHostsExpr, defaultRolesExpr } = buildUserColumnExpressions(userColumns);
    const { roleName, user_name, defaultFlag, typeColumn } = resolveRoleGrantSelectors(roleGrantColumns);
    const roleExpr = `rg.${roleName}`;
    const defaultExpr = defaultFlag ? `coalesce(rg.${defaultFlag}, 0)` : '0';
    const joinCondition = typeColumn
        ? `rg.${user_name} = u.name AND upper(rg.${typeColumn}) = 'USER'`
        : `rg.${user_name} = u.name`;

    const selectParts = [
        'u.name AS name',
        `${hostExpr} AS host_name`,
        `${authExpr} AS authentication_type`,
        `${allowAllExpr} AS allow_all_hosts`,
        `${allowedHostsExpr} AS allowed_client_hosts`,
        `${defaultRolesExpr} AS fallback_default_roles`,
        `coalesce(arrayDistinct(arrayFilter(role -> role != '', groupArray(${roleExpr}))), []) AS granted_roles`,
        `coalesce(arrayDistinct(arrayFilter(role -> role != '', groupArrayIf(${roleExpr}, ${defaultExpr} = 1))), []) AS default_roles`,
    ];

    const groupBy = ['name', 'host_name', 'authentication_type', 'allow_all_hosts', 'allowed_client_hosts', 'fallback_default_roles'].join(', ');

    const query = `
        SELECT
            ${selectParts.join(',\n            ')}
        FROM system.users AS u
        LEFT JOIN system.role_grants AS rg
            ON ${joinCondition}
        GROUP BY ${groupBy}
        ORDER BY name
    `;

    const result = await instance.query<any>(query);
    const rows = result.rows ?? [];
    const globalPrivilegesMap = await collectUserGlobalPrivileges(instance);
    const scopedPrivilegesMap = await collectUserScopedPrivileges(instance);

    return rows.map(row => {
        const name = row.name as string;
        const globalPrivileges = name && globalPrivilegesMap.has(name)
            ? Array.from(globalPrivilegesMap.get(name)!).sort((a, b) => a.localeCompare(b, 'en'))
            : [];
        const scopedPrivileges = scopedPrivilegesMap.get(name) ?? [];
        return mapUserRow(row, { globalPrivileges, scopedPrivileges });
    });
}

export async function getClickHouseUser(instance: ClickhouseDatasource, name: string): Promise<ClickHouseUser | null> {
    const userColumns = await getTableColumns(instance, 'system.users');
    const roleGrantColumns = await getTableColumns(instance, 'system.role_grants');
    const { hostExpr, authExpr, allowAllExpr, allowedHostsExpr, defaultRolesExpr } = buildUserColumnExpressions(userColumns);
    const { roleName, user_name, defaultFlag, typeColumn } = resolveRoleGrantSelectors(roleGrantColumns);
    const roleExpr = `rg.${roleName}`;
    const defaultExpr = defaultFlag ? `coalesce(rg.${defaultFlag}, 0)` : '0';
    const joinCondition = typeColumn
        ? `rg.${user_name} = u.name AND upper(rg.${typeColumn}) = 'USER'`
        : `rg.${user_name} = u.name`;

    const selectParts = [
        'u.name AS name',
        `${hostExpr} AS host_name`,
        `${authExpr} AS authentication_type`,
        `${allowAllExpr} AS allow_all_hosts`,
        `${allowedHostsExpr} AS allowed_client_hosts`,
        `${defaultRolesExpr} AS fallback_default_roles`,
        `coalesce(arrayDistinct(arrayFilter(role -> role != '', groupArray(${roleExpr}))), []) AS granted_roles`,
        `coalesce(arrayDistinct(arrayFilter(role -> role != '', groupArrayIf(${roleExpr}, ${defaultExpr} = 1))), []) AS default_roles`,
    ];

    const groupBy = ['name', 'host_name', 'authentication_type', 'allow_all_hosts', 'allowed_client_hosts', 'fallback_default_roles'].join(', ');

    const query = `
        SELECT
            ${selectParts.join(',\n            ')}
        FROM system.users AS u
        LEFT JOIN system.role_grants AS rg
            ON ${joinCondition}
        WHERE u.name = {name:String}
        GROUP BY ${groupBy}
        ORDER BY name
        LIMIT 1
    `;

    const result = await instance.query<any>(query, { name });
    const row = result.rows?.[0];
    if (!row) return null;

    const [globalPrivilegesMap, scopedPrivilegesMap] = await Promise.all([
        collectUserGlobalPrivileges(instance, [name]),
        collectUserScopedPrivileges(instance, [name]),
    ]);
    const globalPrivileges = Array.from(globalPrivilegesMap.get(name) ?? []).sort((a, b) => a.localeCompare(b, 'en'));
    const scopedPrivileges = scopedPrivilegesMap.get(name) ?? [];

    return mapUserRow(row, { globalPrivileges, scopedPrivileges });
}

export async function createClickHouseUser(instance: ClickhouseDatasource, payload: CreateUserPayload): Promise<void> {
    const nameIdentifier = quoteIdentifier(payload.name);
    const statements: string[] = [];
    const cluster = payload.cluster;

    let createSql = applyClusterClause(`CREATE USER ${nameIdentifier}`, cluster);
    if (payload.password && payload.password.length) {
        createSql += ` IDENTIFIED BY ${quoteString(payload.password)}`;
    }
    createSql += ` ${buildHostClause(payload)}`;
    statements.push(createSql);

    if (payload.roles?.length) {
        statements.push(
            applyClusterClause(`GRANT ${payload.roles.map(quoteIdentifier).join(', ')} TO ${nameIdentifier}`, cluster),
        );
    }

    if (payload.defaultRoles) {
        if (payload.defaultRoles.length === 0) {
            statements.push(applyClusterClause(`ALTER USER ${nameIdentifier} DEFAULT ROLE NONE`, cluster));
        } else {
            statements.push(
                applyClusterClause(
                    `ALTER USER ${nameIdentifier} DEFAULT ROLE ${payload.defaultRoles.map(quoteIdentifier).join(', ')}`,
                    cluster,
                ),
            );
        }
    }

    for (const sql of statements) {
        await instance.command(sql);
    }
}

export async function updateClickHouseUser(instance: ClickhouseDatasource, payload: UpdateUserPayload): Promise<void> {
    const current = await getClickHouseUser(instance, payload.name);
    if (!current) {
        throw new Error('USER_NOT_FOUND');
    }

    const identifier = quoteIdentifier(payload.name);
    const statements: string[] = [];
    const cluster = payload.cluster;
    const alterUserBase = applyClusterClause(`ALTER USER ${identifier}`, cluster);

    if (payload.password !== undefined) {
        if (!payload.password) {
            statements.push(`${alterUserBase} IDENTIFIED WITH no_password`);
        } else {
            statements.push(`${alterUserBase} IDENTIFIED BY ${quoteString(payload.password)}`);
        }
    }

    if (payload.allowAllHosts !== undefined || payload.allowedClientHosts !== undefined) {
        statements.push(`${alterUserBase} ${buildHostClause(payload)}`);
    }

    if (payload.roles) {
        const desired = new Set(payload.roles);
        const currentRoles = new Set(current.grantedRoles);
        const toGrant = payload.roles.filter(role => !currentRoles.has(role));
        const toRevoke = current.grantedRoles.filter(role => !desired.has(role));
        if (toGrant.length) {
            statements.push(
                applyClusterClause(`GRANT ${toGrant.map(quoteIdentifier).join(', ')} TO ${identifier}`, cluster),
            );
        }
        if (toRevoke.length) {
            statements.push(
                applyClusterClause(`REVOKE ${toRevoke.map(quoteIdentifier).join(', ')} FROM ${identifier}`, cluster),
            );
        }
    }

    if (payload.defaultRoles) {
        if (payload.defaultRoles.length === 0) {
            statements.push(applyClusterClause(`ALTER USER ${identifier} DEFAULT ROLE NONE`, cluster));
        } else {
            statements.push(
                applyClusterClause(
                    `ALTER USER ${identifier} DEFAULT ROLE ${payload.defaultRoles.map(quoteIdentifier).join(', ')}`,
                    cluster,
                ),
            );
        }
    }

    for (const sql of statements) {
        await instance.command(sql);
    }

    if (payload.newName && payload.newName !== payload.name) {
        const renameStatement = payload.cluster
            ? `RENAME USER ${identifier} ON CLUSTER ${quoteIdentifier(payload.cluster)} TO ${quoteIdentifier(
                  payload.newName,
              )}`
            : `RENAME USER ${identifier} TO ${quoteIdentifier(payload.newName)}`;
        await instance.command(renameStatement);
    }
}

export async function deleteClickHouseUser(instance: ClickhouseDatasource, payload: DeleteUserPayload): Promise<void> {
    await instance.command(`DROP USER ${quoteIdentifier(payload.name)}`);
}

const PRIVILEGES_REQUIRING_SCOPE = new Set(['SELECT', 'INSERT', 'ALTER', 'CREATE', 'DROP']);

function normalizePrivilegeNames(privileges: string[]): string[] {
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const privilege of privileges) {
        const upper = privilege.trim().toUpperCase();
        if (!upper.length) continue;
        if (seen.has(upper)) continue;
        seen.add(upper);
        normalized.push(upper);
    }
    return normalized;
}

export async function grantUserGlobalPrivileges(
    instance: ClickhouseDatasource,
    payload: { name: string; privileges: string[] },
): Promise<void> {
    const privileges = normalizePrivilegeNames(payload.privileges);
    if (!privileges.length) return;
    const scoped = privileges.filter(priv => PRIVILEGES_REQUIRING_SCOPE.has(priv));
    const global = privileges.filter(priv => !PRIVILEGES_REQUIRING_SCOPE.has(priv));

    if (scoped.length) {
        await instance.command(`GRANT ${scoped.join(', ')} ON *.* TO ${quoteIdentifier(payload.name)}`);
    }

    if (global.length) {
        await instance.command(`GRANT ${global.join(', ')} TO ${quoteIdentifier(payload.name)}`);
    }
}

export async function revokeUserGlobalPrivileges(
    instance: ClickhouseDatasource,
    payload: { name: string; privileges: string[] },
): Promise<void> {
    const privileges = normalizePrivilegeNames(payload.privileges);
    if (!privileges.length) return;
    const scoped = privileges.filter(priv => PRIVILEGES_REQUIRING_SCOPE.has(priv));
    const global = privileges.filter(priv => !PRIVILEGES_REQUIRING_SCOPE.has(priv));

    if (scoped.length) {
        await instance.command(`REVOKE ${scoped.join(', ')} ON *.* FROM ${quoteIdentifier(payload.name)}`);
    }

    if (global.length) {
        await instance.command(`REVOKE ${global.join(', ')} FROM ${quoteIdentifier(payload.name)}`);
    }
}

function buildPrivilegeScope(database: string, object?: string | null): string {
    const db = database.trim();
    if (!db) {
        throw new Error('DATABASE_REQUIRED');
    }
    if (!object || object.trim() === '' || object === '*') {
        return `${quoteIdentifier(db)}.*`;
    }
    return `${quoteIdentifier(db)}.${quoteIdentifier(object.trim())}`;
}

export async function grantUserScopedPrivileges(
    instance: ClickhouseDatasource,
    payload: {
        name: string;
        privileges: string[];
        database: string;
        object?: string | null;
        grantOption?: boolean;
        scopeType: ScopedPrivilegeScope;
    },
): Promise<void> {
    let privileges = normalizePrivilegeNames(payload.privileges);
    privileges = remapPrivilegesForScope(privileges, payload.scopeType);
    if (!privileges.length) return;
    const scope = buildPrivilegeScope(payload.database, payload.object);
    const grantOption = payload.grantOption ? ' WITH GRANT OPTION' : '';
    await instance.command(`GRANT ${privileges.join(', ')} ON ${scope} TO ${quoteIdentifier(payload.name)}${grantOption}`);
}

export async function revokeUserScopedPrivileges(
    instance: ClickhouseDatasource,
    payload: {
        name: string;
        privileges: string[];
        database: string;
        object?: string | null;
        scopeType: ScopedPrivilegeScope;
    },
): Promise<void> {
    let privileges = normalizePrivilegeNames(payload.privileges);
    privileges = remapPrivilegesForScope(privileges, payload.scopeType);
    if (!privileges.length) return;
    const scope = buildPrivilegeScope(payload.database, payload.object);
    await instance.command(`REVOKE ${privileges.join(', ')} ON ${scope} FROM ${quoteIdentifier(payload.name)}`);
}

export async function grantRoleGlobalPrivileges(
    instance: ClickhouseDatasource,
    payload: { name: string; privileges: string[] },
): Promise<void> {
    const privileges = normalizePrivilegeNames(payload.privileges);
    if (!privileges.length) return;
    const scoped = privileges.filter(priv => PRIVILEGES_REQUIRING_SCOPE.has(priv));
    const global = privileges.filter(priv => !PRIVILEGES_REQUIRING_SCOPE.has(priv));

    if (scoped.length) {
        await instance.command(`GRANT ${scoped.join(', ')} ON *.* TO ${quoteIdentifier(payload.name)}`);
    }

    if (global.length) {
        await instance.command(`GRANT ${global.join(', ')} TO ${quoteIdentifier(payload.name)}`);
    }
}

export async function revokeRoleGlobalPrivileges(
    instance: ClickhouseDatasource,
    payload: { name: string; privileges: string[] },
): Promise<void> {
    const privileges = normalizePrivilegeNames(payload.privileges);
    if (!privileges.length) return;
    const scoped = privileges.filter(priv => PRIVILEGES_REQUIRING_SCOPE.has(priv));
    const global = privileges.filter(priv => !PRIVILEGES_REQUIRING_SCOPE.has(priv));

    if (scoped.length) {
        await instance.command(`REVOKE ${scoped.join(', ')} ON *.* FROM ${quoteIdentifier(payload.name)}`);
    }

    if (global.length) {
        await instance.command(`REVOKE ${global.join(', ')} FROM ${quoteIdentifier(payload.name)}`);
    }
}

export async function grantRoleScopedPrivileges(
    instance: ClickhouseDatasource,
    payload: {
        name: string;
        privileges: string[];
        database: string;
        object?: string | null;
        grantOption?: boolean;
        scopeType: ScopedPrivilegeScope;
    },
): Promise<void> {
    let privileges = normalizePrivilegeNames(payload.privileges);
    privileges = remapPrivilegesForScope(privileges, payload.scopeType);
    if (!privileges.length) return;
    const scope = buildPrivilegeScope(payload.database, payload.object);
    const grantOption = payload.grantOption ? ' WITH GRANT OPTION' : '';
    await instance.command(`GRANT ${privileges.join(', ')} ON ${scope} TO ${quoteIdentifier(payload.name)}${grantOption}`);
}

export async function revokeRoleScopedPrivileges(
    instance: ClickhouseDatasource,
    payload: {
        name: string;
        privileges: string[];
        database: string;
        object?: string | null;
        scopeType: ScopedPrivilegeScope;
    },
): Promise<void> {
    let privileges = normalizePrivilegeNames(payload.privileges);
    privileges = remapPrivilegesForScope(privileges, payload.scopeType);
    if (!privileges.length) return;
    const scope = buildPrivilegeScope(payload.database, payload.object);
    await instance.command(`REVOKE ${privileges.join(', ')} ON ${scope} FROM ${quoteIdentifier(payload.name)}`);
}

export async function listClickHouseRoles(instance: ClickhouseDatasource): Promise<ClickHouseRole[]> {
    const rolesResult = await instance.query<{ name: string }>('SELECT name FROM system.roles ORDER BY name');
    const roles = rolesResult.rows ?? [];

    const grantsColumns = await getTableColumns(instance, 'system.grants');
    const selectParts = ['access_type'];
    if (grantsColumns.has('grantee_name')) {
        selectParts.push('grantee_name');
    } else if (grantsColumns.has('grantee')) {
        selectParts.push('grantee AS grantee_name');
    } else if (grantsColumns.has('role_name')) {
        selectParts.push('role_name AS grantee_name');
    } else {
        selectParts.push('NULL AS grantee_name');
    }
    if (grantsColumns.has('grantee_type')) {
        selectParts.push('grantee_type');
    } else {
        selectParts.push('NULL AS grantee_type');
    }
    selectParts.push(grantsColumns.has('database') ? 'database' : 'NULL AS database');
    selectParts.push(grantsColumns.has('table') ? '`table`' : 'NULL AS table');
    selectParts.push(grantsColumns.has('columns') ? 'columns' : '[] AS columns');
    selectParts.push(grantsColumns.has('is_grantable') ? 'is_grantable' : '0 AS is_grantable');

    const grantsResult = await instance.query<any>(
        `SELECT ${selectParts.join(', ')} FROM system.grants`
    );
    const grantRows = grantsResult.rows ?? [];

    const privilegesMap = new Map<string, RolePrivilege[]>();
    for (const row of grantRows) {
        const name = row.grantee_name as string;
        const granteeTypeRaw = 'grantee_type' in row ? row.grantee_type : undefined;
        const granteeType = granteeTypeRaw == null ? 'ROLE' : String(granteeTypeRaw).toUpperCase();
        if (granteeType && granteeType !== 'ROLE') continue;
        if (!name) continue;
        if (!privilegesMap.has(name)) privilegesMap.set(name, []);
        const columns = normalizeArray(row.columns);
        privilegesMap.get(name)!.push({
            privilege: row.access_type,
            database: row.database ?? '*',
            table: row.table ?? '*',
            columns: columns.length ? columns : undefined,
            grantOption: Boolean(row.is_grantable),
        });
    }

    const roleGrants = await collectRoleGrantRelations(instance);
    const grantedToUsers = new Map<string, Set<string>>();
    const grantedToRoles = new Map<string, Set<string>>();

    for (const row of roleGrants) {
        const roleName = row.role_name as string;
        const grantee = row.grantee_name as string;
        const type = typeof row.grantee_type === 'string' ? String(row.grantee_type).toUpperCase() : null;
        if (!roleName || !grantee) continue;
        if (type === 'USER') {
            if (!grantedToUsers.has(roleName)) grantedToUsers.set(roleName, new Set());
            grantedToUsers.get(roleName)!.add(grantee);
        } else if (type === 'ROLE') {
            if (!grantedToRoles.has(roleName)) grantedToRoles.set(roleName, new Set());
            grantedToRoles.get(roleName)!.add(grantee);
        }
    }

    return roles.map(row => {
        const name = row.name;
        return {
            name,
            privileges: privilegesMap.get(name) ?? [],
            grantedToUsers: Array.from(grantedToUsers.get(name) ?? []),
            grantedToRoles: Array.from(grantedToRoles.get(name) ?? []),
        } satisfies ClickHouseRole;
    });
}

export async function getClickHouseRole(instance: ClickhouseDatasource, name: string): Promise<ClickHouseRole | null> {
    const list = await listClickHouseRoles(instance);
    return list.find(role => role.name === name) ?? null;
}

export async function createClickHouseRole(instance: ClickhouseDatasource, payload: CreateRolePayload): Promise<void> {
    await instance.command(applyClusterClause(`CREATE ROLE ${quoteIdentifier(payload.name)}`, payload.cluster));
    if (payload.privileges?.length) {
        for (const privilege of payload.privileges) {
            await instance.command(buildPrivilegeStatement('GRANT', privilege, payload.name, payload.cluster));
        }
    }
}

export async function updateClickHouseRole(instance: ClickhouseDatasource, payload: UpdateRolePayload): Promise<void> {
    const current = await getClickHouseRole(instance, payload.name);
    if (!current) {
        throw new Error('ROLE_NOT_FOUND');
    }

    const cluster = payload.cluster;

    if (payload.privileges) {
        const desiredMap = new Map<string, RolePrivilege>();
        payload.privileges.forEach(priv => desiredMap.set(privilegeKey(priv), priv));

        const currentMap = new Map<string, RolePrivilege>();
        current.privileges.forEach(priv => currentMap.set(privilegeKey(priv), priv));

        for (const [key, priv] of currentMap.entries()) {
            if (!desiredMap.has(key)) {
                await instance.command(buildPrivilegeStatement('REVOKE', priv, payload.name, cluster));
            }
        }

        for (const [key, priv] of desiredMap.entries()) {
            if (!currentMap.has(key)) {
                await instance.command(buildPrivilegeStatement('GRANT', priv, payload.name, cluster));
            }
        }
    }

    if (payload.newName && payload.newName !== payload.name) {
        const renameStatement = cluster
            ? `RENAME ROLE ${quoteIdentifier(payload.name)} ON CLUSTER ${quoteIdentifier(cluster)} TO ${quoteIdentifier(
                  payload.newName,
              )}`
            : `RENAME ROLE ${quoteIdentifier(payload.name)} TO ${quoteIdentifier(payload.newName)}`;
        await instance.command(renameStatement);
    }
}

export async function deleteClickHouseRole(instance: ClickhouseDatasource, payload: DeleteRolePayload): Promise<void> {
    await instance.command(`DROP ROLE ${quoteIdentifier(payload.name)}`);
}

export type ClickhousePrivilegesImpl = {
    listClickHouseUsers: () => Promise<ClickHouseUser[]>;
    getClickHouseUser: (name: string) => Promise<ClickHouseUser | null>;
    createClickHouseUser: (payload: CreateUserPayload) => Promise<void>;
    updateClickHouseUser: (payload: UpdateUserPayload) => Promise<void>;
    deleteClickHouseUser: (payload: DeleteUserPayload) => Promise<void>;
    grantUserGlobalPrivileges: (payload: { name: string; privileges: string[] }) => Promise<void>;
    revokeUserGlobalPrivileges: (payload: { name: string; privileges: string[] }) => Promise<void>;
    grantUserScopedPrivileges: (payload: {
        name: string;
        privileges: string[];
        database: string;
        object?: string | null;
        grantOption?: boolean;
        scopeType: ScopedPrivilegeScope;
    }) => Promise<void>;
    revokeUserScopedPrivileges: (payload: {
        name: string;
        privileges: string[];
        database: string;
        object?: string | null;
        scopeType: ScopedPrivilegeScope;
    }) => Promise<void>;
    listClickHouseRoles: () => Promise<ClickHouseRole[]>;
    getClickHouseRole: (name: string) => Promise<ClickHouseRole | null>;
    createClickHouseRole: (payload: CreateRolePayload) => Promise<void>;
    updateClickHouseRole: (payload: UpdateRolePayload) => Promise<void>;
    deleteClickHouseRole: (payload: DeleteRolePayload) => Promise<void>;
    grantRoleGlobalPrivileges: (payload: { name: string; privileges: string[] }) => Promise<void>;
    revokeRoleGlobalPrivileges: (payload: { name: string; privileges: string[] }) => Promise<void>;
    grantRoleScopedPrivileges: (payload: {
        name: string;
        privileges: string[];
        database: string;
        object?: string | null;
        grantOption?: boolean;
        scopeType: ScopedPrivilegeScope;
    }) => Promise<void>;
    revokeRoleScopedPrivileges: (payload: {
        name: string;
        privileges: string[];
        database: string;
        object?: string | null;
        scopeType: ScopedPrivilegeScope;
    }) => Promise<void>;
};

export function getClickhousePrivilegesImpl(instance: ClickhouseDatasource): ClickhousePrivilegesImpl {
    return {
        listClickHouseUsers: () => listClickHouseUsers(instance),
        getClickHouseUser: (name: string) => getClickHouseUser(instance, name),
        createClickHouseUser: (payload: CreateUserPayload) => createClickHouseUser(instance, payload),
        updateClickHouseUser: (payload: UpdateUserPayload) => updateClickHouseUser(instance, payload),
        deleteClickHouseUser: (payload: DeleteUserPayload) => deleteClickHouseUser(instance, payload),
        grantUserGlobalPrivileges: (payload: { name: string; privileges: string[] }) =>
            grantUserGlobalPrivileges(instance, payload),
        revokeUserGlobalPrivileges: (payload: { name: string; privileges: string[] }) =>
            revokeUserGlobalPrivileges(instance, payload),
        grantUserScopedPrivileges: (payload: {
            name: string;
            privileges: string[];
            database: string;
            object?: string | null;
            grantOption?: boolean;
            scopeType: ScopedPrivilegeScope;
        }) => grantUserScopedPrivileges(instance, payload),
        revokeUserScopedPrivileges: (payload: {
            name: string;
            privileges: string[];
            database: string;
            object?: string | null;
            scopeType: ScopedPrivilegeScope;
        }) => revokeUserScopedPrivileges(instance, payload),
        listClickHouseRoles: () => listClickHouseRoles(instance),
        getClickHouseRole: (name: string) => getClickHouseRole(instance, name),
        createClickHouseRole: (payload: CreateRolePayload) => createClickHouseRole(instance, payload),
        updateClickHouseRole: (payload: UpdateRolePayload) => updateClickHouseRole(instance, payload),
        deleteClickHouseRole: (payload: DeleteRolePayload) => deleteClickHouseRole(instance, payload),
        grantRoleGlobalPrivileges: (payload: { name: string; privileges: string[] }) =>
            grantRoleGlobalPrivileges(instance, payload),
        revokeRoleGlobalPrivileges: (payload: { name: string; privileges: string[] }) =>
            revokeRoleGlobalPrivileges(instance, payload),
        grantRoleScopedPrivileges: (payload: {
            name: string;
            privileges: string[];
            database: string;
            object?: string | null;
            grantOption?: boolean;
            scopeType: ScopedPrivilegeScope;
        }) => grantRoleScopedPrivileges(instance, payload),
        revokeRoleScopedPrivileges: (payload: {
            name: string;
            privileges: string[];
            database: string;
            object?: string | null;
            scopeType: ScopedPrivilegeScope;
        }) => revokeRoleScopedPrivileges(instance, payload),
    };
}
