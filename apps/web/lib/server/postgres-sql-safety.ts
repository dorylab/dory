import { parsePostgresSql } from '@/lib/server/sql-splitter';

const MUTATING_NODE_TYPES = new Set(['CallStmt', 'CopyStmt', 'DeleteStmt', 'DoStmt', 'InsertStmt', 'MergeStmt', 'UpdateStmt']);

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function containsMutatingNode(value: unknown): boolean {
    if (Array.isArray(value)) return value.some(containsMutatingNode);
    if (!isRecord(value)) return false;

    for (const [nodeType, nodeValue] of Object.entries(value)) {
        if (MUTATING_NODE_TYPES.has(nodeType)) return true;
        if (nodeType === 'SelectStmt' && isRecord(nodeValue)) {
            if (nodeValue.intoClause) return true;
            if (Array.isArray(nodeValue.lockingClause) && nodeValue.lockingClause.length > 0) return true;
        }
        if (containsMutatingNode(nodeValue)) return true;
    }
    return false;
}

function isReadOnlyRootNode(node: unknown): boolean {
    if (!isRecord(node)) return false;

    if ('VariableShowStmt' in node) return true;

    const selectStatement = node.SelectStmt;
    if (selectStatement) return !containsMutatingNode({ SelectStmt: selectStatement });

    const explainStatement = node.ExplainStmt;
    if (isRecord(explainStatement)) {
        return isReadOnlyRootNode(explainStatement.query);
    }

    return false;
}

export async function isReadOnlyPostgresStatement(sql: string): Promise<boolean> {
    const result = await parsePostgresSql(sql);
    const statements = result.stmts ?? [];
    return statements.length === 1 && isReadOnlyRootNode(statements[0]?.stmt);
}
