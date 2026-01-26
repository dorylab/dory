// /lib/client/use-pglite.ts
'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { and, eq, gt, asc, sql } from 'drizzle-orm';
import type { DBClient } from '@/types';
import { getDBClient } from './pglite/client';

// ====== Table schema (new) ======
import { querySession, queryResultSet, queryResultPage } from './pglite/schemas';

// Utilities and types
import { createWorkerPool } from '../utils/worker-pool';
import { estimateBytes, isQuotaLikeError, idleYield, sleep, toDate3 } from './utils';
import type { DBHook, ResultSetMeta, TabResult } from './type';
import { useAtomValue, useSetAtom } from 'jotai';
import { dataVersionAtom, bumpDataVersionAtom } from './client.store';
import { encodeRows, toArrayBuffer, decodeRow } from '../utils/binary-codec';
import { translate } from '@/lib/i18n/i18n';
import { getClientLocale } from '@/lib/i18n/client-locale';

// ---------------- Concurrency and pagination params ----------------
const WORKER_COUNT = Math.max(1, Math.min(3, typeof navigator !== 'undefined' && (navigator as any).hardwareConcurrency ? (navigator as any).hardwareConcurrency - 1 : 2));
const MAX_ROWS = 5_000_000;
const MIN_ROWS_PER_PAGE = 50;
const DEFAULT_ROWS_PER_PAGE = 1_000;
const TARGET_PAGE_BYTES = 4 * 1024 * 1024;
const YIELD_MS: number = 8;

function translatePgliteError(key: string) {
    return translate(getClientLocale(), key);
}

export function useDB() {
    const [dbReady, setDbReady] = useState(false);
    const dataVersion = useAtomValue(dataVersionAtom);
    const bumpDataVersion = useSetAtom(bumpDataVersionAtom);

    const userIdRef = useRef<string | null>(null);
    const ormRef = useRef<DBClient | null>(null);
    const poolRef = useRef<ReturnType<typeof createWorkerPool> | null>(null);

    useEffect(() => {
        (async () => {
            const db = await getDBClient();
            if (!db) return;
            ormRef.current = db;
            setDbReady(true);
            if (!poolRef.current) {
                poolRef.current = createWorkerPool(WORKER_COUNT);
            }
        })();

        return () => {
            poolRef.current?.terminate();
            poolRef.current = null;
        };
    }, []);

    const setUserId = useCallback(async (userId: string | null) => {
        userIdRef.current = userId;
    }, []);

    // ============ Sessions ============

    const createQuerySession = useCallback(
        async (params: {
            tabId: string;
            sqlText: string;
            database?: string | null;
            stopOnError?: boolean;
            source?: string | null;
            connectionId?: string | null; // ★ New: pass-through supported
            sessionId?: string; // Can pass existing sessionId; otherwise auto-generate
        }): Promise<string> => {
            if (!ormRef.current) throw new Error(translatePgliteError('Client.Pglite.DbNotInitialized'));
            if (!userIdRef.current) throw new Error(translatePgliteError('Client.Pglite.UserNotInitialized'));

            const orm = ormRef.current;
            const sessionId =
                params.sessionId ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

            await orm
                .insert(querySession)
                .values({
                    sessionId,
                    userId: userIdRef.current!,
                    tabId: params.tabId,
                    connectionId: params.connectionId ?? null,
                    database: params.database ?? null,
                    sqlText: params.sqlText,
                    stopOnError: !!params.stopOnError,
                    source: params.source ?? null,
                    // startedAt defaults to now()
                    // status defaults to running
                })
                .onConflictDoNothing({ target: querySession.sessionId })
                .execute();

            bumpDataVersion();
            return sessionId;
        },
        [bumpDataVersion],
    );

    const finishQuerySession = useCallback(
        async (
            sessionId: string,
            payload: {
                status: 'success' | 'error' | 'canceled';
                errorMessage?: string | null;
                durationMs?: number | null;
                resultSetCount?: number | null;
            },
        ) => {
            if (!ormRef.current) throw new Error(translatePgliteError('Client.Pglite.DbNotInitialized'));

            await ormRef.current
                .update(querySession)
                .set({
                    status: payload.status,
                    errorMessage: payload.errorMessage ?? null,
                    finishedAt: new Date(),
                    durationMs: payload.durationMs ?? null,
                    resultSetCount: payload.resultSetCount ?? undefined,
                })
                .where(eq(querySession.sessionId, sessionId))
                .execute();

            bumpDataVersion();
        },
        [bumpDataVersion],
    );

    const upsertResultSetMeta = useCallback(
        async (
            sessionId: string,
            setIndex: number, // 0-based
            meta: Partial<Omit<ResultSetMeta, 'sessionId' | 'setIndex'>>,
        ) => {
            if (!ormRef.current) throw new Error(translatePgliteError('Client.Pglite.DbNotInitialized'));

            const values = {
                sessionId,
                setIndex, // 0-based
                sqlText: meta.sqlText ?? '', // Schema is NOT NULL; use empty string fallback
                sqlOp: meta.sqlOp ?? null,

                title: meta.title ?? null,
                columns: meta.columns as any,
                rowCount: meta.rowCount ?? null,
                affectedRows: meta.affectedRows ?? null,
                // Only allow 'success' or 'error' for status
                status: meta.status === 'running' ? 'error' : (meta.status ?? 'success'),
                errorMessage: meta.errorMessage ?? null,
                errorCode: meta.errorCode ?? null,
                errorSqlState: meta.errorSqlState ?? null,
                errorMeta: (meta.errorMeta ?? null) as any,
                warnings: (meta.warnings ?? null) as any,

                startedAt: toDate3(meta.startedAt) ?? new Date(),
                finishedAt: toDate3(meta.finishedAt),
                durationMs: meta.durationMs ?? null,
            };

            await ormRef.current
                .insert(queryResultSet)
                .values(values)
                .onConflictDoUpdate({
                    target: [queryResultSet.sessionId, queryResultSet.setIndex],
                    set: {
                        sqlText: values.sqlText,
                        sqlOp: values.sqlOp,
                        title: values.title,
                        columns: values.columns,
                        rowCount: values.rowCount,
                        affectedRows: values.affectedRows,
                        status: values.status,
                        errorMessage: values.errorMessage,
                        errorCode: values.errorCode,
                        errorSqlState: values.errorSqlState,
                        errorMeta: values.errorMeta,
                        warnings: values.warnings,
                        startedAt: values.startedAt,
                        finishedAt: values.finishedAt,
                        durationMs: values.durationMs,
                    },
                })
                .execute();

            bumpDataVersion();
        },
        [bumpDataVersion],
    );


    const listResultSetsMeta = useCallback(
        async (sessionId: string): Promise<ResultSetMeta[] | null> => {
            if (!ormRef.current) throw new Error(translatePgliteError('Client.Pglite.DbNotInitialized'));

            const rows = await ormRef.current
                .select({
                    sessionId: queryResultSet.sessionId,
                    setIndex: queryResultSet.setIndex,
                    sqlText: queryResultSet.sqlText,
                    sqlOp: queryResultSet.sqlOp,

                    title: queryResultSet.title,
                    columns: queryResultSet.columns,
                    rowCount: queryResultSet.rowCount,
                    affectedRows: queryResultSet.affectedRows,
                    status: queryResultSet.status,
                    errorMessage: queryResultSet.errorMessage,
                    errorCode: queryResultSet.errorCode,
                    errorSqlState: queryResultSet.errorSqlState,
                    errorMeta: queryResultSet.errorMeta,
                    warnings: queryResultSet.warnings,

                    startedAt: queryResultSet.startedAt,
                    finishedAt: queryResultSet.finishedAt,
                    durationMs: queryResultSet.durationMs,

                    limited: queryResultSet.limited,
                    limit: queryResultSet.limit,
                })
                .from(queryResultSet)
                .where(eq(queryResultSet.sessionId, sessionId))
                .orderBy(asc(queryResultSet.setIndex))
                .execute();

            if (!rows || rows.length === 0) {
                // ⚠️ No local results for this session
                return null;
            }

            return rows.map(r => ({
                ...r,
                startedAt: r.startedAt ? new Date(r.startedAt as any).getTime() : null,
                finishedAt: r.finishedAt ? new Date(r.finishedAt as any).getTime() : null,
                status: r.status as 'success' | 'error',
            }));
        },
        [],
    );


    // ============ Page-level writes ============

    const safeInsertPages = useCallback(
        async (
            pages: Array<{
                session_id: string;
                set_index: number;
                page_no: number;
                first_row_index: number;
                row_count: number;
                rows_data: Uint8Array;
                is_gzip: boolean;
            }>,
        ) => {
            if (!ormRef.current) throw new Error(translatePgliteError('Client.Pglite.DbNotInitialized'));
            if (!pages.length) return;

            const tryInsert = async (arr: typeof pages) => {
                if (!arr.length) return;
                try {
                    await ormRef.current!.transaction(async tx => {
                        await tx
                            .insert(queryResultPage)
                            .values(
                                arr.map(p => ({
                                    sessionId: p.session_id,
                                    setIndex: p.set_index,
                                    pageNo: p.page_no,
                                    firstRowIndex: p.first_row_index,
                                    rowCount: p.row_count,
                                    rowsData: p.rows_data,
                                    isGzip: p.is_gzip,
                                })),
                            )
                            .onConflictDoNothing({
                                target: [queryResultPage.sessionId, queryResultPage.setIndex, queryResultPage.pageNo],
                            })
                            .execute();
                    });
                } catch (err) {
                    if (!isQuotaLikeError(err) || arr.length === 1) throw err;
                    const mid = Math.floor(arr.length / 2);
                    await tryInsert(arr.slice(0, mid));
                    await tryInsert(arr.slice(mid));
                }
            };

            await tryInsert(pages);
        },
        [],
    );

    const insertResultRows = useCallback(
        async (sessionId: string, setIndex: number, rows: Array<any> | Array<{ rowData: any }>) => {
            if (!ormRef.current) throw new Error(translatePgliteError('Client.Pglite.DbNotInitialized'));
            if (!rows?.length) return;

            // Normalize input to a plain row array
            const plain = Array.isArray(rows) && rows.length && 'rowData' in rows[0] ? (rows as any[]).map(r => r.rowData) : (rows as any[]);

            const limited = plain.slice(0, MAX_ROWS);
            const orm = ormRef.current!;

            // Compute the last existing page
            const last = await orm
                .select({
                    maxPage: sql<number>`coalesce(max(${queryResultPage.pageNo}), -1)`.as('maxPage'),
                    maxRow: sql<number>`coalesce(max(${queryResultPage.firstRowIndex} + ${queryResultPage.rowCount}), 0)`.as('maxRow'),
                })
                .from(queryResultPage)
                .where(and(eq(queryResultPage.sessionId, sessionId), eq(queryResultPage.setIndex, setIndex)));

            let pageNo = (last?.[0]?.maxPage ?? -1) + 1;
            let nextRowIndex = last?.[0]?.maxRow ?? 0;

            if (limited.length === 0) {
                // 0) Ensure a meta row exists
                try {
                    await orm
                        .insert(queryResultSet)
                        .values({
                            sessionId,
                            setIndex,
                            sqlText: '', // New schema requires non-null; empty placeholder
                            sqlOp: null,
                            title: null,
                            columns: null,
                            rowCount: 0,
                            affectedRows: null,
                            status: 'success',
                            errorMessage: null,
                            errorCode: null,
                            errorSqlState: null,
                            errorMeta: null,
                            warnings: null,
                            startedAt: new Date(),
                            finishedAt: new Date(),
                            durationMs: null,
                        })
                        .onConflictDoNothing({ target: [queryResultSet.sessionId, queryResultSet.setIndex] })
                        .execute();
                } catch { }

                const { data, isGzip } = encodeRows([]);
                await safeInsertPages([
                    {
                        session_id: sessionId,
                        set_index: setIndex,
                        page_no: pageNo,
                        first_row_index: nextRowIndex,
                        row_count: 0,
                        rows_data: data,
                        is_gzip: !!isGzip,
                    },
                ]);

                bumpDataVersion();
                return;
            }

            let rowsPerPage = Math.max(DEFAULT_ROWS_PER_PAGE, MIN_ROWS_PER_PAGE);

            for (let base = 0; base < limited.length;) {
                let end = Math.min(base + rowsPerPage, limited.length);
                let slice = limited.slice(base, end);

                // Adaptively shrink by payload size
                let bytes = estimateBytes(slice, true);
                while (bytes > TARGET_PAGE_BYTES && slice.length > MIN_ROWS_PER_PAGE) {
                    const shrinkTo = Math.max(Math.floor(slice.length / 2), MIN_ROWS_PER_PAGE);
                    end = base + shrinkTo;
                    slice = limited.slice(base, end);
                    bytes = estimateBytes(slice, true);
                }

                const { data, isGzip } = encodeRows(slice);
                await safeInsertPages([
                    {
                        session_id: sessionId,
                        set_index: setIndex,
                        page_no: pageNo,
                        first_row_index: nextRowIndex,
                        row_count: slice.length,
                        rows_data: data as Uint8Array,
                        is_gzip: !!isGzip,
                    },
                ]);

                bumpDataVersion();

                base = end;
                pageNo += 1;
                nextRowIndex += slice.length;

                if (YIELD_MS >= 0) {
                    if (YIELD_MS === 0) await idleYield(4);
                    else await sleep(YIELD_MS);
                }

                if (bytes < TARGET_PAGE_BYTES / 2 && rowsPerPage < DEFAULT_ROWS_PER_PAGE * 8) {
                    rowsPerPage = Math.min(rowsPerPage * 2, DEFAULT_ROWS_PER_PAGE * 8);
                } else if (bytes > TARGET_PAGE_BYTES && rowsPerPage > MIN_ROWS_PER_PAGE) {
                    rowsPerPage = Math.max(Math.floor(rowsPerPage / 2), MIN_ROWS_PER_PAGE);
                }
            }
        },
        [safeInsertPages, bumpDataVersion],
    );

    // ============ Page-level reads (parallel decode, row callbacks) ============

    const getResultRows = useCallback(
        async (
            sessionId: string,
            setIndex = 0,
            opts?: {
                onChunk?: (rows: TabResult[]) => void;
                pageFetchLimit?: number;
                signal?: AbortSignal;
                rowBudget?: number;
                emitChunkRows?: number;
                yieldUi?: boolean;
                log?: boolean;
            },
        ): Promise<TabResult[]> => {
            if (!ormRef.current) return [];

            const onChunk = opts?.onChunk;
            const hasConsumer = typeof onChunk === 'function';
            const emitChunkRows = Math.max(1, opts?.emitChunkRows ?? 1000);
            const rowBudgetMax = opts?.rowBudget ?? Number.POSITIVE_INFINITY;
            const yieldUi = opts?.yieldUi ?? true;
            const log = !!opts?.log;

            const orm = ormRef.current!;
            const pool = poolRef.current!;

            const sess = await orm.select({ tabId: querySession.tabId }).from(querySession).where(eq(querySession.sessionId, sessionId)).limit(1);
            const tabIdOfSession = sess?.[0]?.tabId ?? '';
            console.log(`getResultRows: sessionId=${sessionId} setIndex=${setIndex} tabId=${tabIdOfSession} rowBudget=${rowBudgetMax}`);

            const out: TabResult[] = [];
            let emittedRows = 0;
            let lastPageNo: number | null = null;
            let anyPageRead = false;

            const timeBudgetYield = (() => {
                let last = performance.now();
                return async (ms = 10) => {
                    if (!yieldUi) return;
                    const now = performance.now();
                    if (now - last >= ms) {
                        last = now;
                        await new Promise(requestAnimationFrame);
                    }
                };
            })();

            const whereBase = and(eq(queryResultPage.sessionId, sessionId), eq(queryResultPage.setIndex, setIndex));

            const fetchOne = (after: number | null) =>
                orm
                    .select({
                        pageNo: queryResultPage.pageNo,
                        firstRow: queryResultPage.firstRowIndex,
                        rowCount: queryResultPage.rowCount,
                        data: queryResultPage.rowsData,
                        gz: queryResultPage.isGzip,
                    })
                    .from(queryResultPage)
                    .where(after === null ? whereBase : and(whereBase, gt(queryResultPage.pageNo, after)))
                    .orderBy(queryResultPage.pageNo)
                    .limit(1);

            const decodePageSafe = async (u8: Uint8Array, gz: boolean) => {
                const post = (pool as any)?.postBuffers;
                const hasWorker = typeof post === 'function';
                const flags = [!!gz];

                const safeView = new Uint8Array(u8.buffer, u8.byteOffset, u8.byteLength);
                const copyBuf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

                if (hasWorker) {
                    try {
                        return await post([copyBuf], flags);
                    } catch (e: any) {
                        if (log) console.warn('[getResultRows] worker(no-transfer) failed:', e?.message ?? e);
                    }
                }
                try {
                    return decodeRow(safeView, gz);
                } catch (e2: any) {
                    if (log) console.warn('[getResultRows] main-thread decode failed:', e2?.message ?? e2);
                }
                if (hasWorker) {
                    for (let r = 0; r < 3; r++) {
                        if (opts?.signal?.aborted) break;
                        await sleep(30 + r * 20);
                        try {
                            return await post([copyBuf], flags);
                        } catch { }
                    }
                }
                return decodeRow(safeView, gz);
            };

            const emitRowsInSlices = async (rowsOfPage: any[], baseRid: number) => {
                const total = rowsOfPage.length;
                let start = 0;
                while (start < total) {
                    if (opts?.signal?.aborted) return false;
                    const remainBudget = rowBudgetMax - emittedRows;
                    if (remainBudget <= 0) return false;

                    const size = Math.min(emitChunkRows, total - start, remainBudget);
                    const chunk: TabResult[] = new Array(size);
                    for (let i = 0; i < size; i++) {
                        const k = start + i;
                        chunk[i] = { tabId: tabIdOfSession, rid: baseRid + k, rowData: rowsOfPage[k] };
                    }

                    if (hasConsumer) onChunk!(chunk);
                    else out.push(...chunk);

                    emittedRows += size;
                    start += size;

                    await timeBudgetYield(10);
                }
                return true;
            };

            let nextPromise = fetchOne(lastPageNo);

            for (; ;) {
                if (opts?.signal?.aborted) break;

                const pages = await nextPromise;
                if (!pages.length) break;
                anyPageRead = true;

                const page: any = pages[0];
                lastPageNo = page.pageNo;

                nextPromise = fetchOne(lastPageNo);

                const u8 = page.data as Uint8Array;
                let decoded: any;
                try {
                    decoded = await decodePageSafe(u8, !!page.gz);
                } catch (e: any) {
                    if (log) console.warn('[getResultRows] decode failed, skip page:', e?.message ?? e);
                    await timeBudgetYield(8);
                    continue;
                }

                const rowsOfPage = Array.isArray(decoded?.[0]) ? decoded[0] : Array.isArray(decoded) ? decoded : [decoded];
                const baseRid = page.firstRow ?? 0;

                decoded = null;

                const cont = await emitRowsInSlices(rowsOfPage, baseRid);
                if (!cont) break;

                await timeBudgetYield(8);
            }

            if (!anyPageRead) {
                const meta = await orm
                    .select({ rowCount: queryResultSet.rowCount })
                    .from(queryResultSet)
                    .where(and(eq(queryResultSet.sessionId, sessionId), eq(queryResultSet.setIndex, setIndex)))
                    .limit(1);
                if ((meta?.length ?? 0) > 0 && hasConsumer) {
                    onChunk!([]);
                }
            }

            return hasConsumer ? [] : out;
        },
        [],
    );

    // ============ List/cleanup/session fetch ============

    const listResultSetIndices = useCallback(async (sessionId: string): Promise<number[]> => {
        if (!ormRef.current) return [0];
        const orm = ormRef.current;

        const [fromMeta, fromPage] = await Promise.all([
            orm.select({ setIndex: queryResultSet.setIndex }).from(queryResultSet).where(eq(queryResultSet.sessionId, sessionId)).orderBy(asc(queryResultSet.setIndex)),
            orm
                .select({ setIndex: queryResultPage.setIndex })
                .from(queryResultPage)
                .where(eq(queryResultPage.sessionId, sessionId))
                .groupBy(queryResultPage.setIndex)
                .orderBy(asc(queryResultPage.setIndex)),
        ]);

        const s = new Set<number>();
        for (const r of fromMeta) if (typeof r.setIndex === 'number') s.add(r.setIndex);
        for (const r of fromPage) if (typeof r.setIndex === 'number') s.add(r.setIndex);

        const arr = Array.from(s).sort((a, b) => a - b);

        return arr.length ? arr : [0];
    }, []);

    const clearResults = useCallback(
        async (sessionId: string, setIndex?: number) => {
            if (!ormRef.current) return;
            const orm = ormRef.current;

            if (typeof setIndex === 'number') {
                await orm
                    .delete(queryResultPage)
                    .where(and(eq(queryResultPage.sessionId, sessionId), eq(queryResultPage.setIndex, setIndex)))
                    .execute();

                await orm
                    .delete(queryResultSet)
                    .where(and(eq(queryResultSet.sessionId, sessionId), eq(queryResultSet.setIndex, setIndex)))
                    .execute();
            } else {
                await orm.delete(queryResultPage).where(eq(queryResultPage.sessionId, sessionId)).execute();
                await orm.delete(queryResultSet).where(eq(queryResultSet.sessionId, sessionId)).execute();
            }

            bumpDataVersion();
        },
        [bumpDataVersion],
    );

    const getSession = useCallback(async (sessionId: string) => {
        if (!ormRef.current) return null;
        const rows = await ormRef.current
            .select({
                status: querySession.status,
                startedAt: querySession.startedAt,
                finishedAt: querySession.finishedAt,
            })
            .from(querySession)
            .where(eq(querySession.sessionId, sessionId))
            .limit(1);
        return rows?.[0] ?? null;
    }, []);

    // ============ One-shot persist: apply backend response (recommended) ============

    /**
     * Write /api/sql response into three tables:
     * - session: one row in query_session
     * - queryResultSets: batch upsert into query_result_set
     * - results: page-compressed writes into query_result_page by setIndex
     */
    const applyServerResult = useCallback(
        async (payload: {
            session: {
                sessionId: string;
                userId?: string | null;
                tabId?: string | null;
                connectionId?: string | null;
                database?: string | null;
                sqlText: string;
                status: 'running' | 'success' | 'error' | 'canceled';
                errorMessage?: string | null;
                startedAt?: string | Date | null;
                finishedAt?: string | Date | null;
                durationMs?: number | null;
                resultSetCount?: number;
                stopOnError?: boolean;
                source?: string | null;
            };
            queryResultSets: Array<{
                sessionId: string;
                setIndex: number;
                sqlText: string;
                sqlOp?: string | null;
                title?: string | null;
                columns?: unknown | null;
                rowCount?: number | null;
                limited?: boolean | null;
                limit?: number | null;
                affectedRows?: number | null;
                status: 'success' | 'error';
                errorMessage?: string | null;
                errorCode?: string | null;
                errorSqlState?: string | null;
                errorMeta?: unknown | null;
                warnings?: unknown | null;
                startedAt?: string | Date | null;
                finishedAt?: string | Date | null;
                durationMs?: number | null;
            }>;
            results: any[][];
        }) => {
            if (!ormRef.current) throw new Error(translatePgliteError('Client.Pglite.DbNotInitialized'));

            // 1) Session
            const s = payload.session;
            await ormRef.current
                .insert(querySession)
                .values({
                    sessionId: s.sessionId,
                    userId: s.userId ?? userIdRef.current ?? '',
                    tabId: s.tabId ?? '',
                    connectionId: s.connectionId ?? null,
                    database: s.database ?? null,
                    sqlText: s.sqlText,
                    status: s.status,
                    errorMessage: s.errorMessage ?? null,
                    startedAt: s.startedAt ? new Date(s.startedAt) : new Date(),
                    finishedAt: s.finishedAt ? new Date(s.finishedAt) : null,
                    durationMs: s.durationMs ?? null,
                    resultSetCount: s.resultSetCount ?? payload.queryResultSets?.length ?? 0,
                    stopOnError: !!s.stopOnError,
                    source: s.source ?? null,
                })
                .onConflictDoUpdate({
                    target: querySession.sessionId,
                    set: {
                        userId: sql`excluded.user_id`,
                        tabId: sql`excluded.tab_id`,
                        connectionId: sql`excluded.connection_id`,
                        database: sql`excluded.database`,
                        sqlText: sql`excluded.sql_text`,
                        status: sql`excluded.status`,
                        errorMessage: sql`excluded.error_message`,
                        startedAt: sql`excluded.started_at`,
                        finishedAt: sql`excluded.finished_at`,
                        durationMs: sql`excluded.elapsed_ms`,
                        resultSetCount: sql`excluded.result_set_count`,
                        stopOnError: sql`excluded.stop_on_error`,
                        source: sql`excluded.source`,
                    },
                })
                .execute();

            // 2) Result set metadata
            if (payload.queryResultSets?.length) {
                await ormRef.current
                    .insert(queryResultSet)
                    .values(
                        payload.queryResultSets.map(r => ({
                            sessionId: r.sessionId,
                            setIndex: r.setIndex,
                            sqlText: r.sqlText,
                            sqlOp: r.sqlOp ?? null,
                            title: r.title ?? null,
                            columns: (r.columns ?? null) as any,
                            rowCount: r.rowCount ?? null,
                            limited: r.limited ?? false,
                            limit: r.limit ?? null,
                            affectedRows: r.affectedRows ?? null,
                            status: r.status,
                            errorMessage: r.errorMessage ?? null,
                            errorCode: r.errorCode ?? null,
                            errorSqlState: r.errorSqlState ?? null,
                            errorMeta: (r.errorMeta ?? null) as any,
                            warnings: (r.warnings ?? null) as any,
                            startedAt: r.startedAt ? new Date(r.startedAt) : null,
                            finishedAt: r.finishedAt ? new Date(r.finishedAt) : null,
                            durationMs: r.durationMs ?? null,
                        })),
                    )
                    .onConflictDoUpdate({
                        target: [queryResultSet.sessionId, queryResultSet.setIndex],
                        set: {
                            sqlText: sql`excluded.sql_text`,
                            sqlOp: sql`excluded.sql_op`,
                            title: sql`excluded.title`,
                            columns: sql`excluded.columns`,
                            rowCount: sql`excluded.row_count`,
                            limited: sql`excluded.limited`,
                            limit: sql`excluded.limit`,
                            affectedRows: sql`excluded.affected_rows`,
                            status: sql`excluded.status`,
                            errorMessage: sql`excluded.error_message`,
                            errorCode: sql`excluded.error_code`,
                            errorSqlState: sql`excluded.error_sql_state`,
                            errorMeta: sql`excluded.error_meta`,
                            warnings: sql`excluded.warnings`,
                            startedAt: sql`excluded.started_at`,
                            finishedAt: sql`excluded.finished_at`,
                            durationMs: sql`excluded.duration_ms`,
                        },
                    })
                    .execute();
            }

            // 3) Paged row writes
            // Align setIndex with queryResultSets: results[i] → setIndex = i
            if (Array.isArray(payload.results)) {
                for (let i = 0; i < payload.results.length; i++) {
                    const rows = payload.results[i] ?? [];
                    if (!rows.length) {
                        // const { data, isGzip } = encodeRows([]);
                        // await safeInsertPages([
                        //     {
                        //         session_id: s.sessionId,
                        //         set_index: i,
                        //         page_no: 0,
                        //         first_row_index: 0,
                        //         row_count: 0,
                        //         rows_data: data,
                        //         is_gzip: !!isGzip,
                        //     },
                        // ]);
                        continue;
                    }
                    // rows are raw arrays (already row objects)
                    if (Array.isArray(payload.results) && Array.isArray(payload.queryResultSets)) {
                        for (let k = 0; k < payload.queryResultSets.length; k++) {
                            const si = payload.queryResultSets[k]!.setIndex;
                            const rows = payload.results[k] ?? []; // If backend keeps results aligned with queryResultSets
                            if (rows.length) await insertResultRows(s.sessionId, si, rows);
                        }
                    }
                }
            }

            bumpDataVersion();
        },
        [insertResultRows, safeInsertPages, bumpDataVersion],
    );

    // ============ Exports ============

    return useMemo(
        () => ({
            dbReady,
            dataVersion,
            setUserId,

            createQuerySession,
            finishQuerySession,
            upsertResultSetMeta,
            listResultSetsMeta,

            insertResultRows,
            getResultRows,
            listResultSetIndices,
            clearResults,
            getSession,

            applyServerResult, // ★ New: store backend payload directly
        }),
        [
            dbReady,
            dataVersion,
            setUserId,
            createQuerySession,
            finishQuerySession,
            upsertResultSetMeta,
            listResultSetsMeta,
            insertResultRows,
            getResultRows,
            listResultSetIndices,
            clearResults,
            getSession,
            applyServerResult,
        ],
    );
}
