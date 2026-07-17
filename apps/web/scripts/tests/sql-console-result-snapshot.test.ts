import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeSqlConsoleResultSnapshot } from '../../lib/client/sql-console-result-snapshot';

test('normalizes persisted stream results into an immediate result-table snapshot', () => {
    const snapshot = normalizeSqlConsoleResultSnapshot({
        session: {
            sessionId: 'session-1',
            status: 'success',
            startedAt: '2026-07-16T06:00:00.000Z',
            finishedAt: '2026-07-16T06:00:01.000Z',
            durationMs: 1000,
            resultSetCount: 1,
            source: 'sql-console',
        },
        results: [[{ id: 1 }, { id: 2 }]],
        queryResultSets: [
            {
                sessionId: 'session-1',
                setIndex: 0,
                sqlText: 'select * from users limit 200',
                sqlOp: 'SELECT',
                columns: [{ name: 'id' }],
                rowCount: 200,
                previewRowCount: 200,
                resultSetId: 'rs-1',
                dataAvailability: 'full',
                status: 'success',
                startedAt: '2026-07-16T06:00:00.000Z',
                finishedAt: '2026-07-16T06:00:01.000Z',
                durationMs: 1000,
                byteSize: 193_986_560,
                artifactStore: 'filesystem',
                storageFormat: 'parquet',
                sourceConnectionType: 'sqlite',
                sourceDatabaseName: 'main',
                createdAt: '2026-07-16T06:00:01.000Z',
                expiresAt: '2026-07-23T06:00:01.000Z',
            },
        ],
    });

    assert.ok(snapshot);
    assert.equal(snapshot.session.sessionId, 'session-1');
    assert.equal(snapshot.session.status, 'success');
    assert.equal(snapshot.resultSets.length, 1);
    assert.equal(snapshot.resultSets[0]!.resultSetId, 'rs-1');
    assert.equal(snapshot.resultSets[0]!.rowCount, 200);
    assert.equal(snapshot.resultSets[0]!.byteSize, 193_986_560);
    assert.equal(snapshot.resultSets[0]!.artifactStore, 'filesystem');
    assert.equal(snapshot.resultSets[0]!.storageFormat, 'parquet');
    assert.equal(snapshot.resultSets[0]!.sourceConnectionType, 'sqlite');
    assert.equal(snapshot.resultSets[0]!.sourceDatabaseName, 'main');
    assert.equal(snapshot.resultSets[0]!.createdAt, Date.parse('2026-07-16T06:00:01.000Z'));
    assert.equal(snapshot.resultSets[0]!.expiresAt, Date.parse('2026-07-23T06:00:01.000Z'));
    assert.deepEqual(snapshot.resultSets[0]!.columns, [{ name: 'id' }]);
    assert.deepEqual(snapshot.resultSets[0]!.previewRows, [{ id: 1 }, { id: 2 }]);
});

test('ignores stream events before a persisted result-set id is available', () => {
    const snapshot = normalizeSqlConsoleResultSnapshot({
        session: {
            sessionId: 'session-1',
            status: 'running',
        },
        queryResultSets: [
            {
                sessionId: 'session-1',
                setIndex: 0,
                status: 'running',
            },
        ],
    });

    assert.equal(snapshot, null);
});

test('normalizes error metadata without a persisted result set', () => {
    const snapshot = normalizeSqlConsoleResultSnapshot({
        session: {
            sessionId: 'session-error',
            status: 'error',
            errorMessage: 'no such table: missing_table',
            durationMs: 7,
        },
        results: [[{ error: 'no such table: missing_table' }]],
        queryResultSets: [
            {
                sessionId: 'session-error',
                setIndex: 0,
                sqlText: 'select * from missing_table',
                status: 'error',
                errorMessage: 'no such table: missing_table',
                durationMs: 7,
            },
        ],
    });

    assert.ok(snapshot);
    assert.equal(snapshot.resultSets.length, 1);
    assert.equal(snapshot.resultSets[0]!.status, 'error');
    assert.equal(snapshot.resultSets[0]!.resultSetId, null);
    assert.equal(snapshot.resultSets[0]!.dataAvailability, null);
    assert.equal(snapshot.resultSets[0]!.errorMessage, 'no such table: missing_table');
    assert.deepEqual(snapshot.resultSets[0]!.previewRows, [{ error: 'no such table: missing_table' }]);
});

test('ignores successful results without a persisted result-set id', () => {
    const snapshot = normalizeSqlConsoleResultSnapshot({
        session: {
            sessionId: 'session-success',
            status: 'success',
        },
        queryResultSets: [
            {
                sessionId: 'session-success',
                setIndex: 0,
                status: 'success',
            },
        ],
    });

    assert.equal(snapshot, null);
});
