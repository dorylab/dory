import { assertReportAttachmentDataset } from '@/lib/work-documents/workspace-evidence';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ActionContext } from '@dory/actions';
import type { DBService } from '@dory/database';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { WorkEvidence } from '@dory/shared/types/work-document';
import { loadReportEvidence, reportWorkspaceContext } from '@/lib/server/report-workspace-context';
import type { WebActionServices } from '@/lib/actions/server/types';
import { buildReportWorkspacePath, reportWorkspaceReturnPath } from '@/lib/work-documents/workspace-url';

const reference = { documentId: 'report', revision: 2, artifactId: 'artifact', snapshotId: 'snap' };
const evidence: WorkEvidence = {
    artifactId: 'artifact',
    snapshotId: 'snap',
    title: 'Count',
    sql: 'select count(*) from customers',
    connectionId: 'connection',
    connectionName: 'Customers',
    sourceDatabaseName: 'original_database',
    capturedAt: '2026-10-28T00:00:00Z',
    columns: ['count'],
    rows: [{ count: 2000 }],
    rowCount: 1,
    truncated: false,
    runId: null,
};
function fixture(overrides: Partial<WorkEvidence> = {}) {
    const reads: string[] = [];
    const document = { title: 'Report', revision: 2, chatId: 'chat', content: { evidence: [{ ...evidence, ...overrides }] } };
    const db = {
        workDocuments: {
            getVersion: async (input: { userId: string; revision: number }) => {
                reads.push(`revision:${input.revision}`);
                if (input.userId !== 'owner') throw new DatabaseError('Report not found', 404);
                return document;
            },
            getPublication: async () => {
                reads.push('publication');
                return document;
            },
        },
        connections: { getById: async () => ({ connection: { type: 'postgres' } }) },
        artifacts: {
            get: async () => {
                throw new DatabaseError('Expired', 404);
            },
        },
    } as unknown as DBService;
    const ctx = {
        organizationId: 'org',
        userId: 'owner',
        services: { db },
        access: { permissions: { connection: { read: true } } },
    } as unknown as ActionContext<WebActionServices>;
    return { ctx, reads };
}

test('Workspace reads only the requested report revision/publication, even with expired Artifacts', async () => {
    const { ctx, reads } = fixture();
    const result = await reportWorkspaceContext(ctx, reference);
    assert.deepEqual(result.evidence.rows, [{ count: 2000 }]);
    assert.deepEqual(result.source, { kind: 'database', connectionId: 'connection', database: 'original_database', dialect: 'postgres' });
    assert.deepEqual(reads, ['revision:2']);
    await loadReportEvidence(ctx, { ...reference, publicationId: 'publication' });
    assert.deepEqual(reads, ['revision:2', 'publication']);
    await assert.rejects(loadReportEvidence({ ...ctx, userId: 'other' }, reference), /not found/);
    await assert.rejects(loadReportEvidence(ctx, { ...reference, revision: 3 }), /version/);
    await assert.rejects(loadReportEvidence(ctx, { ...reference, snapshotId: 'another' }), /snapshot/);
});

test('missing legacy database context keeps the snapshot available without guessing a database', async () => {
    const { ctx } = fixture({ sourceDatabaseName: undefined });
    const result = await reportWorkspaceContext(ctx, reference);
    assert.equal(result.source.kind, 'unavailable');
    assert.equal(result.evidence.rows[0].count, 2000);
});

test('attachment context needs no connection, source session, or query execution', async () => {
    const { ctx } = fixture({ connectionId: null, attachmentSource: { userId: 'owner', chatId: 'chat', files: [] } });
    const result = await reportWorkspaceContext(ctx, reference);
    assert.deepEqual(result.source, { kind: 'attachment', dialect: 'duckdb' });
    assert.equal(result.evidence.rows[0].count, 2000);
});

test('report workspace URLs retain exact version, snapshot and publication without a connection', () => {
    const path = buildReportWorkspacePath('team one', { ...reference, publicationId: 'published' });
    assert.equal(path, '/team%20one/reports/report/workspace/artifact?revision=2&publication=published&snapshot=snap');
    assert.equal(reportWorkspaceReturnPath('team one', { ...reference, publicationId: 'published' }), '/team%20one/reports/report?publication=published');
});

test('attachment reruns reject changed files, missing sheets and unrelated attachments', () => {
    const source = { userId: 'owner', chatId: 'chat', files: [{ attachmentId: 'file', filename: 'customers.csv', sha256: 'original', table: 'customers' }] };
    const data = { attachmentId: 'file', sha256: 'original', tables: [{ name: 'customers' }] };
    assert.doesNotThrow(() => assertReportAttachmentDataset(source, data));
    assert.throws(() => assertReportAttachmentDataset(source, { ...data, sha256: 'changed' }), /changed/);
    assert.throws(() => assertReportAttachmentDataset(source, { ...data, tables: [] }), /changed/);
    assert.throws(() => assertReportAttachmentDataset(source, { ...data, attachmentId: 'unrelated' }), /changed/);
});
