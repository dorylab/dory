import { NextResponse } from 'next/server';
import { ErrorCodes } from '@/lib/errors';
import { ResponseUtil } from '@/lib/result';
import { getOrCreateConnectionPool } from '@/lib/connection/connection-service';
import { splitMultiSQL } from '@/lib/utils/split-multi-sql';
import { BaseConnection } from '@dory/drivers/core';
import { withAutomationHandler } from '../../with-automation-handler';
import { parseSqlOp, MAX_STATEMENTS } from '../../utils';

async function executeStatement(connection: BaseConnection, statement: string, context: { database?: string }) {
    const perfStart = performance.now();
    try {
        const result = await connection.queryWithContext(statement, {
            database: context.database,
        });
        const rows = result.rows ?? [];
        const durationMs = Math.round(performance.now() - perfStart);
        const isArrayRows = Array.isArray(rows);

        return {
            ok: true as const,
            sql: statement,
            operation: parseSqlOp(statement),
            columns: result.columns ?? null,
            rows: isArrayRows ? rows : [],
            rowCount: result.rowCount ?? (isArrayRows ? rows.length : 0),
            durationMs,
        };
    } catch (err: any) {
        const durationMs = Math.round(performance.now() - perfStart);
        return {
            ok: false as const,
            sql: statement,
            operation: parseSqlOp(statement),
            columns: null,
            rows: [],
            rowCount: 0,
            durationMs,
            error: {
                message: String(err?.message || err),
                code: err?.code ?? null,
            },
        };
    }
}

/**
 * POST /api/automation/query/execute
 *
 * Execute SQL against a database connection.
 *
 * Body:
 * {
 *   "connectionId": "xxx",
 *   "sql": "SELECT * FROM users LIMIT 100",
 *   "database": "mydb"          // optional
 *   "stopOnError": true          // optional, default true
 * }
 */
export const POST = withAutomationHandler(async ({ req, organizationId }) => {
    const body = await req.json();
    const { connectionId, sql, database, stopOnError = true } = body;

    if (!connectionId) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.INVALID_PARAMS,
                message: 'Missing required field: connectionId',
            }),
            { status: 400 },
        );
    }

    if (!sql || typeof sql !== 'string' || !sql.trim()) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.INVALID_PARAMS,
                message: 'Missing required field: sql',
            }),
            { status: 400 },
        );
    }

    const poolEntry = await getOrCreateConnectionPool(organizationId, connectionId);
    if (!poolEntry) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.NOT_FOUND,
                message: 'Connection not found or could not be established.',
            }),
            { status: 404 },
        );
    }

    const connection = poolEntry.instance;
    const statements = splitMultiSQL(sql).filter(s => !!s.trim());

    if (!statements.length) {
        return NextResponse.json(ResponseUtil.success({ results: [], durationMs: 0 }));
    }

    if (statements.length > MAX_STATEMENTS) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.VALIDATION_ERROR,
                message: `Too many statements (${statements.length}). Maximum is ${MAX_STATEMENTS}.`,
            }),
            { status: 400 },
        );
    }

    const perfStart = performance.now();
    const results: Array<Awaited<ReturnType<typeof executeStatement>>> = [];

    for (const statement of statements) {
        const result = await executeStatement(connection, statement, { database });
        results.push(result);
        if (!result.ok && stopOnError) break;
    }

    const totalDurationMs = Math.round(performance.now() - perfStart);

    return NextResponse.json(
        ResponseUtil.success({
            results,
            summary: {
                totalStatements: results.length,
                successful: results.filter(r => r.ok).length,
                failed: results.filter(r => !r.ok).length,
                durationMs: totalDurationMs,
            },
        }),
    );
});
