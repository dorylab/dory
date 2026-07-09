// /lib/client/use-pglite.ts
'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { and, eq, gt, asc, sql } from 'drizzle-orm';
import type { DBClient } from '@dory/shared';
import { getDBClient } from './pglite/client';

// ====== Table schema (new) ======
import { querySession, queryResultSet, queryResultPage } from './pglite/schemas';

// Utilities and types
import { createWorkerPool } from '@dory/web-utils/worker-pool';
import { estimateBytes, isQuotaLikeError, idleYield, sleep, toDate3 } from './utils';
import type { DBHook, ResultSetMeta, ResultSetRemoteFilter, ResultSetRemoteSearch, ResultSetRemoteSort, TabResult } from './type';
import { useAtomValue, useSetAtom } from 'jotai';
import { dataVersionAtom, bumpDataVersionAtom } from './client.store';
import { encodeRows, toArrayBuffer, decodeRow } from '@dory/web-utils/binary-codec';
import { translate } from '@dory/i18n/translate';
import { getClientLocale } from '@dory/i18n/client';
import { profileResultSet, type ResultSetStatsV1, type ResultSetViewState } from './result-set-ai';
import { executeActionClient } from '@/lib/actions/client';

// ---------------- Concurrency and pagination params ----------------
const WORKER_COUNT = Math.max(1, Math.min(3, typeof navigator !== 'undefined' && (navigator as any).hardwareConcurrency ? (navigator as any).hardwareConcurrency - 1 : 2));
const MAX_ROWS = 5_000_000;
const MIN_ROWS_PER_PAGE = 50;
const DEFAULT_ROWS_PER_PAGE = 1_000;
const TARGET_PAGE_BYTES = 4 * 1024 * 1024;
const YIELD_MS: number = 8;
const RESULT_SET_PROFILE_VERSION = 2;
const REMOTE_RESULT_PAGE_SIZE = 5000;

type ReadResultRowsResponse = {
    resultSetId: string;
    rows: Record<string, unknown>[];
    offset: number;
    limit: number;
    rowCount: number | null;
    unfilteredRowCount?: number | null;
    columns: unknown[];
    dataAvailability: string;
};

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
                stats: (meta.stats ?? null) as any,
                viewState: (meta.viewState ?? null) as any,
                aiProfileVersion: meta.aiProfileVersion ?? RESULT_SET_PROFILE_VERSION,
                rowCount: meta.rowCount ?? null,
                resultSetId: meta.resultSetId ?? null,
                dataAvailability: meta.dataAvailability ?? null,
                previewRowCount: meta.previewRowCount ?? null,
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
                        stats: values.stats,
                        viewState: values.viewState,
                        aiProfileVersion: values.aiProfileVersion,
                        rowCount: values.rowCount,
                        resultSetId: values.resultSetId,
                        dataAvailability: values.dataAvailability,
                        previewRowCount: values.previewRowCount,
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

    const updateResultSetViewState = useCallback(
        async (sessionId: string, setIndex: number, viewState: ResultSetViewState | null) => {
            if (!ormRef.current) throw new Error(translatePgliteError('Client.Pglite.DbNotInitialized'));

            await ormRef.current
                .update(queryResultSet)
                .set({
                    viewState: (viewState ?? null) as any,
                })
                .where(and(eq(queryResultSet.sessionId, sessionId), eq(queryResultSet.setIndex, setIndex)))
                .execute();
        },
        [],
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
                    stats: queryResultSet.stats,
                    viewState: queryResultSet.viewState,
                    aiProfileVersion: queryResultSet.aiProfileVersion,
                    rowCount: queryResultSet.rowCount,
                    resultSetId: queryResultSet.resultSetId,
                    dataAvailability: queryResultSet.dataAvailability,
                    previewRowCount: queryResultSet.previewRowCount,
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
                columns: (r.columns ?? null) as any,
                stats: (r.stats ?? null) as ResultSetStatsV1 | null,
                viewState: (r.viewState ?? null) as ResultSetViewState | null,
                aiProfileVersion: r.aiProfileVersion ?? RESULT_SET_PROFILE_VERSION,
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
                            stats: null,
                            viewState: null,
                            aiProfileVersion: RESULT_SET_PROFILE_VERSION,
                            rowCount: 0,
                            resultSetId: null,
                            dataAvailability: null,
                            previewRowCount: null,
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

            const [remoteMeta] = await orm
                .select({
                    resultSetId: queryResultSet.resultSetId,
                    dataAvailability: queryResultSet.dataAvailability,
                })
                .from(queryResultSet)
                .where(and(eq(queryResultSet.sessionId, sessionId), eq(queryResultSet.setIndex, setIndex)))
                .limit(1);

            if (remoteMeta?.resultSetId && remoteMeta.dataAvailability === 'full') {
                let offset = 0;
                const pageSize = Math.min(REMOTE_RESULT_PAGE_SIZE, Math.max(emitChunkRows, Math.min(rowBudgetMax, REMOTE_RESULT_PAGE_SIZE)));

                for (;;) {
                    if (opts?.signal?.aborted) break;
                    if (emittedRows >= rowBudgetMax) break;

                    const remainingBudget = rowBudgetMax - emittedRows;
                    const limit = Math.max(1, Math.min(pageSize, remainingBudget));
                    const response = await executeActionClient<ReadResultRowsResponse>(
                        'resultSet.rows.read',
                        {
                            resultSetId: remoteMeta.resultSetId,
                            offset,
                            limit,
                        },
                        { signal: opts?.signal },
                    );

                    const rows = Array.isArray(response.rows) ? response.rows : [];
                    if (!rows.length) {
                        if (offset === 0 && hasConsumer) onChunk!([]);
                        break;
                    }

                    const cont = await emitRowsInSlices(rows, offset);
                    offset += rows.length;
                    if (!cont || rows.length < limit) break;

                    const rowCount = typeof response.rowCount === 'number' ? response.rowCount : null;
                    if (rowCount != null && offset >= rowCount) break;
                    if (response.dataAvailability !== 'full') break;

                    await timeBudgetYield(8);
                }

                return hasConsumer ? [] : out;
            }

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

    const readResultSetRows = useCallback(
        async (params: {
            resultSetId: string;
            offset?: number;
            limit?: number;
            sorts?: ResultSetRemoteSort[];
            filters?: ResultSetRemoteFilter[];
            search?: ResultSetRemoteSearch | null;
            signal?: AbortSignal;
        }): Promise<ReadResultRowsResponse> => {
            return executeActionClient<ReadResultRowsResponse>(
                'resultSet.rows.read',
                {
                    resultSetId: params.resultSetId,
                    offset: params.offset ?? 0,
                    limit: params.limit ?? 1000,
                    sorts: params.sorts,
                    filters: params.filters,
                    search: params.search,
                },
                { signal: params.signal },
            );
        },
        [],
    );

    const exportResultSet = useCallback<DBHook['exportResultSet']>(async params => {
        return executeActionClient(
            'resultSet.export.create',
            {
                resultSetId: params.resultSetId,
                format: params.format,
                sorts: params.sorts,
                filters: params.filters,
                search: params.search,
            },
        );
    }, []);

    const readResultSetChart = useCallback<DBHook['readResultSetChart']>(async params => {
        return executeActionClient('resultSet.chart.read', {
            resultSetId: params.resultSetId,
            xKey: params.xKey,
            yKey: params.yKey,
            groupKey: params.groupKey,
            chartType: params.chartType,
            filters: params.filters,
            search: params.search,
        });
    }, []);

    const readResultSetProfile = useCallback<DBHook['readResultSetProfile']>(async params => {
        return executeActionClient(
            'resultSet.profile.read',
            {
                resultSetId: params.resultSetId,
                sampleRows: params.sampleRows,
            },
            { signal: params.signal },
        );
    }, []);

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

    const profileAndPersistResultSet = useCallback(
        async (params: {
            sessionId: string;
            setIndex: number;
            sqlText: string;
            rawColumns: unknown;
            rows: any[];
            rowCount?: number | null;
            limited?: boolean | null;
            limit?: number | null;
        }) => {
            if (!ormRef.current) return;
            if (!Array.isArray(params.rows)) return;

            try {
                const objectRows = params.rows.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row));
                const { columns, stats } = profileResultSet({
                    sqlText: params.sqlText,
                    rawColumns: params.rawColumns,
                    rows: objectRows,
                    rowCount: params.rowCount ?? objectRows.length,
                    limited: params.limited ?? false,
                    limit: params.limit ?? null,
                });

                await ormRef.current
                    .update(queryResultSet)
                    .set({
                        columns: columns as any,
                        stats: stats as any,
                        aiProfileVersion: RESULT_SET_PROFILE_VERSION,
                    })
                    .where(and(eq(queryResultSet.sessionId, params.sessionId), eq(queryResultSet.setIndex, params.setIndex)))
                    .execute();
                bumpDataVersion();
            } catch (error) {
                console.warn('[useDB.profileAndPersistResultSet] failed', {
                    sessionId: params.sessionId,
                    setIndex: params.setIndex,
                    error,
                });
            }
        },
        [bumpDataVersion],
    );

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
                stats?: ResultSetStatsV1 | null;
                viewState?: ResultSetViewState | null;
                aiProfileVersion?: number | null;
                rowCount?: number | null;
                limited?: boolean | null;
                limit?: number | null;
                resultSetId?: string | null;
                dataAvailability?: string | null;
                previewRowCount?: number | null;
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
            await ormRef.current.delete(queryResultPage).where(eq(queryResultPage.sessionId, s.sessionId)).execute();
            await ormRef.current.delete(queryResultSet).where(eq(queryResultSet.sessionId, s.sessionId)).execute();

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
                            stats: (r.stats ?? null) as any,
                            viewState: (r.viewState ?? null) as any,
                            aiProfileVersion: r.aiProfileVersion ?? RESULT_SET_PROFILE_VERSION,
                            rowCount: r.rowCount ?? null,
                            limited: r.limited ?? false,
                            limit: r.limit ?? null,
                            resultSetId: r.resultSetId ?? null,
                            dataAvailability: r.dataAvailability ?? null,
                            previewRowCount: r.previewRowCount ?? null,
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
                            stats: sql`excluded.stats`,
                            viewState: sql`excluded.view_state`,
                            aiProfileVersion: sql`excluded.ai_profile_version`,
                            rowCount: sql`excluded.row_count`,
                            limited: sql`excluded.limited`,
                            limit: sql`excluded.limit`,
                            resultSetId: sql`excluded.result_set_id`,
                            dataAvailability: sql`excluded.data_availability`,
                            previewRowCount: sql`excluded.preview_row_count`,
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
            // Keep 1:1 mapping between queryResultSets[k] and results[k].
            if (Array.isArray(payload.results) && Array.isArray(payload.queryResultSets)) {
                for (let k = 0; k < payload.queryResultSets.length; k++) {
                    const resultSet = payload.queryResultSets[k]!;
                    if (resultSet.resultSetId && resultSet.dataAvailability === 'full') continue;
                    const si = resultSet.setIndex;
                    const rows = payload.results[k] ?? [];
                    if (!rows.length) continue;
                    await insertResultRows(s.sessionId, si, rows);
                }
            }

            bumpDataVersion();

            for (let k = 0; k < payload.queryResultSets.length; k++) {
                const resultSet = payload.queryResultSets[k];
                if (!resultSet || resultSet.status !== 'success') continue;

                const rows = payload.results[k] ?? [];
                queueMicrotask(() => {
                    void profileAndPersistResultSet({
                        sessionId: s.sessionId,
                        setIndex: resultSet.setIndex,
                        sqlText: resultSet.sqlText,
                        rawColumns: resultSet.columns,
                        rows,
                        rowCount: resultSet.rowCount ?? rows.length,
                        limited: resultSet.limited ?? false,
                        limit: resultSet.limit ?? null,
                    });
                });
            }
        },
        [insertResultRows, safeInsertPages, bumpDataVersion, profileAndPersistResultSet],
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
            updateResultSetViewState,
            listResultSetsMeta,

            insertResultRows,
            getResultRows,
            readResultSetRows,
            exportResultSet,
            readResultSetChart,
            readResultSetProfile,
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
            updateResultSetViewState,
            listResultSetsMeta,
            insertResultRows,
            getResultRows,
            readResultSetRows,
            exportResultSet,
            readResultSetChart,
            readResultSetProfile,
            listResultSetIndices,
            clearResults,
            getSession,
            applyServerResult,
        ],
    );
}
