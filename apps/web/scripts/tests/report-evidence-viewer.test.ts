import assert from 'node:assert/strict';
import test from 'node:test';
import type { ActionContext } from '@dory/actions';
import type { DBService } from '@dory/database';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { WorkEvidence } from '@dory/shared/types/work-document';
import { inspectReportEvidence, readReportEvidenceRows } from '@/lib/server/report-evidence';
import type { WebActionServices } from '@/lib/actions/server/types';

const reference = { documentId: 'report', revision: 3, artifactId: 'artifact', snapshotId: 'snap-3' };
const evidence: WorkEvidence = {
    artifactId: 'artifact',
    snapshotId: 'snap-3',
    title: 'Historical query',
    sql: 'select * from events limit 100',
    connectionId: 'disconnected',
    connectionName: 'Historical source',
    capturedAt: '2026-10-20T00:00:00Z',
    columns: ['value'],
    rows: [{ value: 'original snapshot' }],
    rowCount: 100,
    truncated: true,
    runId: null,
};

function fixture({
    missing = false,
    full = true,
    savedEvidence = evidence,
    status = 'success',
    limited = false,
}: {
    missing?: boolean;
    full?: boolean;
    savedEvidence?: WorkEvidence;
    status?: string | null;
    limited?: boolean | null;
} = {}) {
    const reads: unknown[] = [];
    const document = { revision: 3, chatId: 'chat', content: { evidence: [savedEvidence] } };
    const db = {
        workDocuments: {
            getVersion: async () => document,
            getPublication: async () => document,
        },
        artifacts: {
            get: async () => {
                if (missing) throw new DatabaseError('Unavailable', 404);
                return {
                    sourceResultSetId: 'stored-result',
                    resultSet: { dataAvailability: full ? 'full' : 'preview-only', status: status ?? undefined, limited: limited ?? undefined },
                };
            },
        },
        resultSets: {
            readRows: async (input: unknown) => {
                reads.push(input);
                return { columns: [{ name: 'value' }], rows: [{ value: 'full page' }], rowCount: 100, dataAvailability: 'full', offset: 25, limit: 25 };
            },
        },
    } as unknown as DBService;
    const ctx = {
        organizationId: 'org',
        userId: 'owner',
        services: { db },
        access: { permissions: { workspace: { write: true } } },
    } as unknown as ActionContext<WebActionServices>;
    return { ctx, reads };
}

test('Evidence inspection returns frozen report data without querying the original connection or reading full rows', async () => {
    const { ctx, reads } = fixture();
    const result = await inspectReportEvidence(ctx, reference);
    assert.deepEqual(result.evidence.rows, [{ value: 'original snapshot' }]);
    assert.equal(result.fullResultAvailable, true);
    assert.deepEqual(reads, []);
});

test('Evidence inspection preserves historical snapshots when original artifacts are missing', async () => {
    const { ctx } = fixture({ missing: true });
    const result = await inspectReportEvidence(ctx, reference);
    assert.deepEqual(result.evidence, evidence);
    assert.equal(result.fullResultAvailable, false);
    assert.equal(result.artifactAvailable, false);
    await assert.rejects(readReportEvidenceRows(ctx, { ...reference, offset: 0, limit: 25 }), /full original result is unavailable/);
});

test('Full result paging is scoped to the exact version snapshot and retained result', async () => {
    const { ctx, reads } = fixture();
    assert.deepEqual(await readReportEvidenceRows(ctx, { ...reference, offset: 25, limit: 25 }), {
        columns: ['value'],
        rows: [{ value: 'full page' }],
        rowCount: 100,
        offset: 25,
        limit: 25,
    });
    assert.deepEqual(reads, [{ organizationId: 'org', userId: 'owner', chatId: 'chat', resultSetId: 'stored-result', offset: 25, limit: 25 }]);
    await assert.rejects(readReportEvidenceRows(ctx, { ...reference, snapshotId: undefined, offset: 0, limit: 25 }), /exact report snapshot/);
    await assert.rejects(readReportEvidenceRows(ctx, { ...reference, snapshotId: 'newer', offset: 0, limit: 25 }), /not found in this version/);
    await assert.rejects(readReportEvidenceRows(ctx, { ...reference, revision: 4, offset: 0, limit: 25 }), /version does not match/);
    assert.equal(reads.length, 1);
});

test('Preview-only data is never presented as a full result', async () => {
    const { ctx, reads } = fixture({ full: false });
    assert.equal((await inspectReportEvidence(ctx, reference)).fullResultAvailable, false);
    await assert.rejects(readReportEvidenceRows(ctx, { ...reference, offset: 0, limit: 25 }), /full original result is unavailable/);
    assert.deepEqual(reads, []);
});

for (const [label, options] of [
    ['failed', { status: 'error' }],
    ['canceled', { status: 'canceled' }],
    ['driver-limited', { limited: true }],
    ['unknown execution status', { status: null }],
    ['unknown truncation status', { limited: null }],
] as const) {
    test(`${label} results retain the report snapshot but cannot be read as complete results`, async () => {
        const { ctx, reads } = fixture(options);
        const inspection = await inspectReportEvidence(ctx, reference);
        assert.deepEqual(inspection.evidence, evidence);
        assert.equal(inspection.fullResultAvailable, false);
        await assert.rejects(readReportEvidenceRows(ctx, { ...reference, offset: 0, limit: 25 }), /full original result is unavailable/);
        assert.deepEqual(reads, []);
    });
}

test('Private attachment evidence is rejected before exposing metadata or reading full data', async () => {
    const { ctx, reads } = fixture({
        savedEvidence: { ...evidence, attachmentSource: { userId: 'someone-else', chatId: 'private-chat', files: [] } },
    });
    await assert.rejects(inspectReportEvidence(ctx, reference), /Private attachment/);
    await assert.rejects(readReportEvidenceRows(ctx, { ...reference, offset: 0, limit: 25 }), /Private attachment/);
    assert.deepEqual(reads, []);
});
