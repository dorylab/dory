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
            },
        ],
    });

    assert.ok(snapshot);
    assert.equal(snapshot.session.sessionId, 'session-1');
    assert.equal(snapshot.session.status, 'success');
    assert.equal(snapshot.resultSets.length, 1);
    assert.equal(snapshot.resultSets[0]!.resultSetId, 'rs-1');
    assert.equal(snapshot.resultSets[0]!.rowCount, 200);
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
