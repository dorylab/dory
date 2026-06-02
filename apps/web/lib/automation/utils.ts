/**
 * Pure utility functions for automation callers.
 */

export { isReadOnlyQuery } from '@/app/api/utils/sql-readonly';

export function resolveOrganizationIdFromHeaders(headers: Headers): string | null {
    return headers.get('x-organization-id') ?? headers.get('x-org-id') ?? null;
}

export function parseSqlOp(s: string): string {
    const first = s.trim().split(/\s+/)[0]?.toUpperCase() || 'SQL';
    if (['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REPLACE'].includes(first)) return first;
    if (['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME'].includes(first)) return 'DDL';
    if (['BEGIN', 'START', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'RELEASE'].includes(first)) return 'TXN';
    return first;
}

export const MAX_STATEMENTS = 100;
export const AI_ROW_LIMIT = 200;
