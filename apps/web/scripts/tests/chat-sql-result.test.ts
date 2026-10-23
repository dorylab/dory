import assert from 'node:assert/strict';
import test from 'node:test';

import { getSqlResultFromPart } from '@/lib/agent-runs/sql-result';

const output = { result: [{ amount: 42 }], columns: [{ name: 'amount', type: 'number' }], rowCount: 1, truncated: false, executionTimeMs: 12, sessionId: 'query-1' };

test('global and dynamic SQL tool outputs preserve SQL, rows and database', () => {
    for (const part of [
        { type: 'tool-sqlRunner', input: { sql: 'select amount', database: 'sales' }, output },
        { type: 'dynamic-tool', toolName: 'sqlRunner', input: { sql: 'select amount', database: 'sales' }, output },
        { type: 'tool-result', toolName: 'dory_run_readonly_sql', args: { sql: 'select amount', database: 'sales' }, result: output },
    ]) {
        const result = getSqlResultFromPart(part);
        assert.equal(result?.ok, true);
        assert.equal(result?.sql, 'select amount');
        assert.equal(result?.database, 'sales');
        assert.deepEqual(result?.previewRows, [{ amount: 42 }]);
        assert.equal(result?.durationMs, 12);
    }
});
test('empty results remain valid; unrelated tools and incomplete output are not query results', () => {
    assert.deepEqual(getSqlResultFromPart({ type: 'tool-sqlRunner', output: { ...output, result: [], rowCount: 0 } })?.previewRows, []);
    assert.equal(getSqlResultFromPart({ type: 'tool-exploreSchema', output }), null);
    assert.equal(getSqlResultFromPart({ type: 'tool-sqlRunner', output: { sessionId: 'query-1' } }), null);
});
test('single-source envelopes preserve truncation and manual execution errors', () => {
    assert.equal(getSqlResultFromPart({ type: 'dynamic-tool', toolName: 'sqlRunner', output: { type: 'sql-result', ok: true, hasMore: true } })?.truncated, true);
    const result = getSqlResultFromPart({
        type: 'tool-sqlRunner',
        output: { type: 'sql-result', ok: false, sql: 'delete from users', manualExecution: { required: true }, error: { message: 'Read only' } },
    });
    assert.equal(result?.ok, false);
    assert.equal(result?.error?.message, 'Read only');
    assert.equal(result?.manualExecution?.required, true);
});
