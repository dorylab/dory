import { X_CONNECTION_ID_KEY } from '@/app/config/app';
import { ErrorCodes } from '@/lib/errors';
import { ResponseUtil } from '@/lib/result';
import { splitMultiSQL } from '@/lib/utils/split-multi-sql';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import z from 'zod';
import { logger } from '@/lib/logger';
import { BaseConnection } from '@/lib/connection/base/base-connection';
import { getOrCreateConnectionPool } from '@/lib/connection/connection-service';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';


const MAX_STATEMENTS = 100; 
const DEFAULT_STOP_ON_ERROR = false;
function preciseDateNow(): Date {
    return new Date(performance.timeOrigin + performance.now());
}


function createDatabaseNameSchema(t: (key: string, values?: Record<string, unknown>) => string) {
    return z
        .string()
        .min(1, t('Api.Query.Errors.DatabaseNameRequired'))
        .max(64, t('Api.Query.Errors.DatabaseNameTooLong'))
        .regex(/^[a-zA-Z0-9_.-]+$/, t('Api.Query.Errors.DatabaseNameInvalid'));
}


function parseSqlOp(s: string): string {
    const first = s.trim().split(/\s+/)[0]?.toUpperCase() || 'SQL';
    if (['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REPLACE'].includes(first)) return first;
    if (['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME'].includes(first)) return 'DDL';
    if (['BEGIN', 'START', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'RELEASE'].includes(first)) return 'TXN';
    return first;
}


function makeTitle(s: string): string {
    const op = parseSqlOp(s);
    const preview = s.trim().slice(0, 40).replace(/\s+/g, ' ');
    return `${op}: ${preview}`;
}


function nowEpochMsFromPerf(): number {
    return performance.timeOrigin + performance.now();
}


async function executeOne(
    connection: BaseConnection,
    statement: string,
    context: { database?: string },
    options?: { queryId?: string },
) {
    const startedAt = preciseDateNow(); 
    const perfStart = performance.now();

    try {
        const result = await connection.queryWithContext(statement, {
            database: context.database,
            queryId: options?.queryId,
        });
        const rows = result.rows ?? [];

        const finishedAt = preciseDateNow(); 
        const durationMs = performance.now() - perfStart;

        const isArrayRows = Array.isArray(rows);
        const affectedRows = !isArrayRows && rows && typeof rows === 'object' && 'affectedRows' in rows ? (rows as any).affectedRows : null;
        const rowCount = result.rowCount ?? (isArrayRows ? rows.length : affectedRows != null ? 1 : 0);


        return {
            ok: true as const,
            resultRows: isArrayRows ? rows : affectedRows != null ? [{ ok: true, affectedRows }] : [],
            qrs: {
                sqlText: statement,
                sqlOp: parseSqlOp(statement),
                title: makeTitle(statement),
                columns: result.columns ?? null,
                rowCount,
                limited: result.limited ?? false,
                limit: result.limit ?? null,
                affectedRows,
                status: 'success' as const,
                errorMessage: null,
                errorCode: null,
                errorSqlState: null,
                errorMeta: null,
                warnings: null,
                startedAt,
                finishedAt,
                durationMs: Math.round(durationMs),
            },
        };
    } catch (err: any) {
        console.log('SQL statement failed', err);
        const finishedAt = preciseDateNow(); 
        const durationMs = performance.now() - perfStart;

        return {
            ok: false as const,
            resultRows: [{ error: String(err?.message || err), code: err?.code, sql: statement }],
            qrs: {
                sqlText: statement,
                sqlOp: parseSqlOp(statement),
                title: makeTitle(statement),
                columns: null,
                rowCount: 0,
                affectedRows: null,
                status: 'error' as const,
                errorMessage: String(err?.message || err),
                errorCode: err?.code ?? null,
                errorSqlState: err?.sqlState ?? err?.sqlstate ?? null,
                errorMeta: err
                    ? {
                          errno: err?.errno ?? null,
                          name: err?.name ?? null,
                      }
                    : null,
                warnings: null,
                startedAt,
                finishedAt,
                durationMs: Math.round(durationMs),
            },
        };
    }
}

export const POST = withUserAndTeamHandler(async ({ req, teamId }) => {
    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
    const DatabaseNameSchema = createDatabaseNameSchema(t);
    const connectionId = req.headers.get(X_CONNECTION_ID_KEY);
    const data = await req.json();

    
    const userId: string | undefined = data.userId; 
    const tabId: string | undefined = data.tabId; 
    const source: string | undefined = data.source; 

    const rawDatabase = data.database;
    let database: string | undefined =
        typeof rawDatabase === 'string' ? rawDatabase.trim() : undefined;
    const sqlText = String(data.sql ?? '');
    const stopOnError: boolean = data.stopOnError ?? DEFAULT_STOP_ON_ERROR;
    const sessionId: string = String(data.sessionId || randomUUID()); 

    if (!connectionId) {
        return Response.json({ error: t('Api.Query.Errors.MissingConnectionId') }, { status: 400 });
    }

    if (database) {
        const parsed = DatabaseNameSchema.safeParse(database);
        if (!parsed.success) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.VALIDATION_ERROR,
                    message: parsed.error.issues[0].message,
                }),
                { status: 400 },
            );
        }
        database = parsed.data;
    }

    const poolEntry = await getOrCreateConnectionPool(teamId, connectionId);
    if (!poolEntry) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.UNAUTHORIZED,
                message: t('Api.Query.Errors.ConnectionFailed'),
            }),
            { status: 404 },
        );
    }

    const connection = poolEntry.instance;

    try {
        console.log('Executing SQL:', { database, sqlText });

        
        const statements = splitMultiSQL(sqlText).filter(s => !!s.trim());
        if (!statements.length) {
            const nowPerf = performance.now();
            const nowEpoch = Math.round(performance.timeOrigin + nowPerf);
            return NextResponse.json(
                ResponseUtil.success({
                    session: {
                        // —— query_session —— //
                        sessionId,
                        userId: userId ?? null,
                        tabId: tabId ?? null,
                        connectionId,
                        database: database ?? null,
                        sqlText,
                        status: 'success', 
                        errorMessage: null,
                        startedAt: nowEpoch, // epoch ms
                        finishedAt: nowEpoch, // epoch ms
                        durationMs: 0,
                        resultSetCount: 0,
                        stopOnError,
                        source: source ?? null,
                    },
                    queryResultSets: [], // —— query_result_set —— //
                    results: [],
                    meta: {
                        refId: data.refId || randomUUID(),
                        durationMs: 0,
                        totalSets: 0,
                        stopOnError,
                    },
                }),
            );
        }

        if (statements.length > MAX_STATEMENTS) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.VALIDATION_ERROR,
                    message: t('Api.Query.Errors.TooManyStatements', { max: MAX_STATEMENTS, count: statements.length }),
                }),
                { status: 400 },
            );
        }

        
        const sessT0 = performance.now();
        let overallStartedAt = Math.round(performance.timeOrigin + sessT0);

        const queryResultSets: Array<any> = [];
        const results: Array<any[]> = [];

        let hitError = false;
        let firstErrorMsg: string | null = null;

        
        for (let i = 0; i < statements.length; i++) {
            const s = statements[i];

            const execOne = await executeOne(connection, s, { database }, { queryId: sessionId });

            
            const qrs = {
                sessionId,
                setIndex: i,
                ...execOne.qrs,
            };

            queryResultSets.push(qrs);
            results.push(execOne.resultRows);

            if (!execOne.ok) {
                hitError = true;
                if (!firstErrorMsg) firstErrorMsg = qrs.errorMessage;
                if (stopOnError) break;
            }
        }

        
        const sessT1 = performance.now();
        let overallFinishedAt = Math.round(performance.timeOrigin + sessT1);
        const overallDuration = Math.max(0, Math.round(sessT1 - sessT0));

        if (overallFinishedAt === overallStartedAt && overallDuration > 0) {
            overallFinishedAt = overallStartedAt + overallDuration;
        }

        
        const status: 'success' | 'error' = hitError ? 'error' : 'success';
        const session = {
            sessionId,
            userId: userId ?? null,
            tabId: tabId ?? null,
            connectionId,
            database: database ?? null,
            sqlText, 
            status,
            errorMessage: hitError ? firstErrorMsg : null,
            startedAt: overallStartedAt, 
            finishedAt: overallFinishedAt, 
            durationMs: overallDuration, 
            resultSetCount: queryResultSets.length,
            stopOnError,
            source: source ?? null,
        };

        return NextResponse.json(
            ResponseUtil.success({
                session, 
                queryResultSets, 
                results, 
                meta: {
                    refId: data.refId || randomUUID(),
                    durationMs: overallDuration,
                    totalSets: queryResultSets.length,
                    stopOnError,
                },
            }),
        );
    } catch (e: any) {
        logger.info('SQL execution error', e);
        return NextResponse.json(ResponseUtil.error(e));
    }
});
