import assert from 'node:assert/strict';
import test from 'node:test';

import type { BaseConnection, DriverPoolEntry } from '@dory/drivers/core';
import type { DriverQueryResult, DriverQueryRowStream } from '@dory/drivers/types';
import {
    createSqlAuditConnectionSnapshot,
    isSqlAuditConnectionSnapshotCurrent,
    logDeniedSqlAudit,
    patchDriverInstanceForSqlAudit,
    patchDriverPoolForSqlAudit,
    runWithSqlAudit,
    setSqlAuditWriteOverrideForTests,
    type SqlAuditConnectionSnapshot,
} from '../../lib/server/sql-audit';
import { getAuditSourceGroup, type AuditPayload, type QueryStatus } from '@dory/shared/types/audit';

type AuditWrite = AuditPayload & { status: QueryStatus };

function createConnection(overrides: Partial<BaseConnection> = {}) {
    const instance = {
        config: {
            id: 'conn-1',
            type: 'postgres',
            host: 'localhost',
            database: 'default_db',
        },
        async query(_sql: string, _params?: unknown, _context?: unknown): Promise<DriverQueryResult<{ id: number }>> {
            void _sql;
            void _params;
            void _context;
            return {
                rows: [{ id: 1 }],
                rowCount: 1,
                columns: [{ name: 'id', type: 'integer' }],
            };
        },
        async queryWithContext(sql: string, context?: { database?: string; queryId?: string }): Promise<DriverQueryResult<{ id: number }>> {
            return this.query(sql, undefined, context);
        },
        async queryRowsStreamWithContext(): Promise<DriverQueryRowStream<{ id: number }>> {
            return {
                rows: (async function* () {
                    yield { id: 1 };
                    yield { id: 2 };
                })(),
                rowCount: null,
                columns: [{ name: 'id', type: 'integer' }],
            };
        },
        async command(sql: string): Promise<void> {
            await this.query(sql);
        },
        ...overrides,
    };

    return patchDriverInstanceForSqlAudit(instance as unknown as BaseConnection);
}

function createSnapshot(overrides: Partial<SqlAuditConnectionSnapshot> = {}): SqlAuditConnectionSnapshot {
    return {
        connectionId: 'conn-1',
        connectionName: 'Warehouse',
        identityId: 'identity-1',
        identityName: 'Analyst',
        identityUsername: 'analyst_user',
        identityRole: 'readonly',
        identityDatabase: 'analytics',
        identityUpdatedAt: '2026-05-29T00:00:00.000Z',
        identityFingerprint: ['identity-1', 'analyst_user', 'readonly', 'analytics', '2026-05-29T00:00:00.000Z'].join('\u001f'),
        ...overrides,
    };
}

function createPoolEntry(snapshot = createSnapshot()): DriverPoolEntry {
    const instance = createConnection();
    return patchDriverPoolForSqlAudit(
        {
            type: 'postgres',
            instance,
            config: instance.config,
            idleTimer: null,
        } as DriverPoolEntry,
        snapshot,
    )!;
}

function captureAuditWrites() {
    const writes: AuditWrite[] = [];
    setSqlAuditWriteOverrideForTests(payload => {
        writes.push(payload);
    });
    return writes;
}

test.afterEach(() => {
    setSqlAuditWriteOverrideForTests(null);
});

test('audits successful SQL execution inside a SQL audit context', async () => {
    const writes = captureAuditWrites();
    const connection = createConnection();

    await runWithSqlAudit(
        {
            organizationId: 'org-1',
            userId: 'user-1',
            source: 'user_sql_console',
            connectionId: 'conn-1',
            databaseName: 'db_from_context',
        },
        () => connection.queryWithContext('select 1', { database: 'db_from_call', queryId: 'query-1' }),
    );

    assert.equal(writes.length, 1);
    assert.equal(writes[0]!.status, 'success');
    assert.equal(writes[0]!.source, 'user_sql_console');
    assert.equal(writes[0]!.sqlText, 'select 1');
    assert.equal(writes[0]!.databaseName, 'db_from_call');
    assert.equal(writes[0]!.queryId, 'query-1');
    assert.equal(writes[0]!.rowsRead, 1);
});

test('audits SQL execution with connection and identity snapshot from the driver entry', async () => {
    const writes = captureAuditWrites();
    const entry = createPoolEntry();

    await runWithSqlAudit(
        {
            organizationId: 'org-1',
            userId: 'user-1',
            source: 'user_sql_console',
            connectionId: 'conn-1',
        },
        () => entry.instance.query('select current_user'),
    );

    assert.equal(writes.length, 1);
    assert.equal(writes[0]!.connectionName, 'Warehouse');
    assert.equal(writes[0]!.identityId, 'identity-1');
    assert.equal(writes[0]!.identityName, 'Analyst');
    assert.equal(writes[0]!.identityUsername, 'analyst_user');
    assert.equal(writes[0]!.identityRole, 'readonly');
    assert.equal(writes[0]!.identityDatabase, 'analytics');
});

test('audits failed SQL execution and rethrows the original error', async () => {
    const writes = captureAuditWrites();
    const connection = createConnection({
        async query() {
            throw new Error('syntax error');
        },
    });

    await assert.rejects(
        () =>
            runWithSqlAudit(
                {
                    organizationId: 'org-1',
                    userId: 'user-1',
                    source: 'user_sql_console',
                    connectionId: 'conn-1',
                },
                () => connection.query('select bad'),
            ),
        /syntax error/,
    );

    assert.equal(writes.length, 1);
    assert.equal(writes[0]!.status, 'error');
    assert.equal(writes[0]!.errorMessage, 'syntax error');
    assert.equal(writes[0]!.sqlText, 'select bad');
});

test('audits each executed statement in a multi-statement caller', async () => {
    const writes = captureAuditWrites();
    const connection = createConnection();

    await runWithSqlAudit(
        {
            organizationId: 'org-1',
            userId: 'user-1',
            source: 'automation_sql',
            connectionId: 'conn-1',
        },
        async () => {
            await connection.query('select 1');
            await connection.query('select 2');
        },
    );

    assert.deepEqual(
        writes.map(write => write.sqlText),
        ['select 1', 'select 2'],
    );
});

test('does not duplicate nested queryWithContext to query delegation', async () => {
    const writes = captureAuditWrites();
    const connection = createConnection();

    await runWithSqlAudit(
        {
            organizationId: 'org-1',
            userId: 'user-1',
            source: 'mcp_sql_runner',
            connectionId: 'conn-1',
        },
        () => connection.queryWithContext('select nested', { database: 'db' }),
    );

    assert.equal(writes.length, 1);
    assert.equal(writes[0]!.sqlText, 'select nested');
});

test('audits successful streaming SQL execution after consuming rows', async () => {
    const writes = captureAuditWrites();
    const connection = createConnection();

    const stream = await runWithSqlAudit(
        {
            organizationId: 'org-1',
            userId: 'user-1',
            source: 'user_sql_console',
            connectionId: 'conn-1',
            databaseName: 'db_from_context',
        },
        () => connection.queryRowsStreamWithContext('select stream', { database: 'db_from_call', queryId: 'stream-query-1' }),
    );

    const rows = [];
    for await (const row of stream.rows) {
        rows.push(row);
    }

    assert.deepEqual(rows, [{ id: 1 }, { id: 2 }]);
    assert.equal(writes.length, 1);
    assert.equal(writes[0]!.status, 'success');
    assert.equal(writes[0]!.source, 'user_sql_console');
    assert.equal(writes[0]!.sqlText, 'select stream');
    assert.equal(writes[0]!.databaseName, 'db_from_call');
    assert.equal(writes[0]!.queryId, 'stream-query-1');
    assert.equal(writes[0]!.rowsRead, 2);
});

test('does not audit driver calls outside a SQL audit context', async () => {
    const writes = captureAuditWrites();
    const connection = createConnection();

    await connection.query('select outside');

    assert.equal(writes.length, 0);
});

test('can write denied audit entries for rejected SQL', async () => {
    const writes = captureAuditWrites();
    const snapshot = createSnapshot();

    await logDeniedSqlAudit(
        {
            organizationId: 'org-1',
            userId: 'user-1',
            source: 'mcp_sql_runner',
            connectionId: 'conn-1',
            connectionSnapshot: snapshot,
        },
        {
            sqlText: 'drop table users',
            errorMessage: 'Only read-only SQL is allowed.',
        },
    );

    assert.equal(writes.length, 1);
    assert.equal(writes[0]!.status, 'denied');
    assert.equal(writes[0]!.source, 'mcp_sql_runner');
    assert.equal(writes[0]!.sqlText, 'drop table users');
    assert.equal(writes[0]!.identityUsername, 'analyst_user');
});

test('does not expose secrets in identity audit snapshots', async () => {
    const snapshot = createSqlAuditConnectionSnapshot(
        {
            connection: {
                id: 'conn-1',
                name: 'Warehouse',
            },
            identities: [],
            ssh: null,
        } as unknown as Parameters<typeof createSqlAuditConnectionSnapshot>[0],
        {
            id: 'identity-1',
            name: 'Analyst',
            username: 'analyst_user',
            role: 'readonly',
            database: 'analytics',
            isDefault: true,
            password: 'secret-password',
            token: 'secret-token',
            updatedAt: new Date('2026-05-29T00:00:00.000Z'),
        } as Parameters<typeof createSqlAuditConnectionSnapshot>[1],
    );

    assert.deepEqual(
        Object.keys(snapshot).filter(key => /password|token|secret/i.test(key)),
        [],
    );
    assert.equal(JSON.stringify(snapshot).includes('secret-password'), false);
    assert.equal(JSON.stringify(snapshot).includes('secret-token'), false);
});

test('detects identity fingerprint changes before reusing a driver pool', () => {
    const entry = createPoolEntry(createSnapshot());
    const changedIdentity = createSnapshot({
        identityUsername: 'new_user',
        identityFingerprint: ['identity-1', 'new_user', 'readonly', 'analytics', '2026-05-29T00:00:00.000Z'].join('\u001f'),
    });

    assert.equal(isSqlAuditConnectionSnapshotCurrent(entry, createSnapshot()), true);
    assert.equal(isSqlAuditConnectionSnapshotCurrent(entry, changedIdentity), false);
});

test('audit write failures do not affect SQL execution results', async () => {
    setSqlAuditWriteOverrideForTests(() => {
        throw new Error('audit store unavailable');
    });
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
        const connection = createConnection();
        const result = await runWithSqlAudit(
            {
                organizationId: 'org-1',
                userId: 'user-1',
                source: 'user_sql_console',
                connectionId: 'conn-1',
            },
            () => connection.query('select 1'),
        );

        assert.equal(result.rowCount, 1);
    } finally {
        console.error = originalConsoleError;
    }
});

test('maps detailed audit sources to stable product groups', () => {
    assert.equal(getAuditSourceGroup('user_sql_console'), 'user');
    assert.equal(getAuditSourceGroup('dory_schema_metadata'), 'dory_system');
    assert.equal(getAuditSourceGroup('ai_sql_runner'), 'ai');
    assert.equal(getAuditSourceGroup('automation_ai_sql'), 'automation');
    assert.equal(getAuditSourceGroup('mcp_monitoring'), 'mcp');
});
