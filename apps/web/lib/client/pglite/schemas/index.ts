import { pgTable, primaryKey, index, check, text, integer, boolean, timestamp, jsonb, pgEnum, foreignKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { pgBytea } from './bytea';

// ---------- enums ----------
export const sessionStatusEnum = pgEnum('query_session_status', ['running', 'success', 'error', 'canceled']);
export const resultStatusEnum = pgEnum('query_result_status', ['success', 'error']);

// ========== query_session ==========
export const querySession = pgTable(
    'query_session',
    {
        sessionId: text('session_id').primaryKey(),
        userId: text('user_id').notNull(),
        tabId: text('tab_id').notNull(),

        // Shared context
        connectionId: text('connection_id'),
        database: text('database'),

        // Full SQL text for this run (may be multi-statement)
        sqlText: text('sql_text').notNull(),

        // Execution status
        status: sessionStatusEnum('status').notNull().default('running'),
        errorMessage: text('error_message'),

        // Timing
        startedAt: timestamp('started_at', { withTimezone: false, precision: 3 }).notNull().defaultNow(),
        finishedAt: timestamp('finished_at', { withTimezone: false, precision: 3 }),
        durationMs: integer('elapsed_ms'),

        // Other
        resultSetCount: integer('result_set_count').notNull().default(0),
        stopOnError: boolean('stop_on_error').notNull().default(false),
        source: text('source'),
    },
    t => [index('idx_qs_user_tab_time').on(t.userId, t.tabId, t.startedAt), check('chk_qs_elapsed_nonneg', sql`${t.durationMs} IS NULL OR ${t.durationMs} >= 0`)],
);

// ========== query_result_set ==========
export const queryResultSet = pgTable(
    'query_result_set',
    {
        sessionId: text('session_id').notNull(),
        setIndex: integer('set_index').notNull(),

        // Single-statement info
        sqlText: text('sql_text').notNull(),
        sqlOp: text('sql_op'),

        title: text('title'),
        columns: jsonb('columns'), // Suggested: [{ name, type, ... }]
        rowCount: integer('row_count'),

        limited: boolean('limited').notNull().default(false),
        limit: integer('limit'),
        
        affectedRows: integer('affected_rows'),

        status: resultStatusEnum('status').notNull().default('success'),
        errorMessage: text('error_message'),
        errorCode: text('error_code'),
        errorSqlState: text('error_sql_state'),
        errorMeta: jsonb('error_meta'),
        warnings: jsonb('warnings'),

        // Per-statement timing
        startedAt: timestamp('started_at', { withTimezone: false, precision: 3 }),
        finishedAt: timestamp('finished_at', { withTimezone: false, precision: 3 }),
        durationMs: integer('duration_ms'),
    },
    t => [
        primaryKey({ name: 'pk_qrs', columns: [t.sessionId, t.setIndex] }),
        // Composite FK: points to query_session(session_id) with cascade delete (browser too)
        foreignKey({
            columns: [t.sessionId],
            foreignColumns: [querySession.sessionId],
            name: 'fk_qrs_session',
        }).onDelete('cascade'),

        index('idx_qrs_session').on(t.sessionId, t.setIndex),
        index('idx_qrs_status').on(t.status),
        index('idx_qrs_sqlop').on(t.sqlOp),

        check('chk_qrs_setindex_nonneg', sql`${t.setIndex} >= 0`),
        check('chk_qrs_rowcount_nonneg', sql`${t.rowCount} IS NULL OR ${t.rowCount} >= 0`),
        check('chk_qrs_affected_nonneg', sql`${t.affectedRows} IS NULL OR ${t.affectedRows} >= 0`),
        check('chk_qrs_duration_nonneg', sql`${t.durationMs} IS NULL OR ${t.durationMs} >= 0`),

        // Enforce limit >= 0
        check('chk_qrs_limit_nonneg', sql`${t.limit} IS NULL OR ${t.limit} >= 0`),
    ],
);

// ========== query_result_page ==========
export const queryResultPage = pgTable(
    'query_result_page',
    {
        sessionId: text('session_id').notNull(),
        setIndex: integer('set_index').notNull(),
        pageNo: integer('page_no').notNull(),

        firstRowIndex: integer('first_row_index').notNull(), // First row index in full result set
        rowCount: integer('row_count').notNull(), // Row count in this page

        rowsData: pgBytea('rows_data').notNull(), // Custom bytea (gzip/json/cbor, etc.)
        isGzip: boolean('is_gzip').notNull().default(true),

        createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    },
    t => [
        primaryKey({ name: 'pk_qrp', columns: [t.sessionId, t.setIndex, t.pageNo] }),

        // Composite FK: points to query_result_set(session_id, set_index) with cascade delete
        foreignKey({
            columns: [t.sessionId, t.setIndex],
            foreignColumns: [queryResultSet.sessionId, queryResultSet.setIndex],
            name: 'fk_qrp_resultset',
        }).onDelete('cascade'),

        index('idx_qrp_read').on(t.sessionId, t.setIndex, t.pageNo),

        check('chk_qrp_pageno_nonneg', sql`${t.pageNo} >= 0`),
        check('chk_qrp_firstrow_nonneg', sql`${t.firstRowIndex} >= 0`),
        check('chk_qrp_rowcount_pos', sql`${t.rowCount} > 0`),
    ],
);
