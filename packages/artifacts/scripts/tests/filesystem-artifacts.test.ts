import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { AgentRunArtifactStore, FilesystemObjectStore, readableToBuffer, ResultSetArtifactStore, S3CompatibleObjectStore } from '../../src/index';
import { buildResultSetPreview, resultSetDataAvailability, type ResultSetManifest } from '@dory/resultset';

const root = await mkdtemp(path.join(os.tmpdir(), 'dory-artifacts-test-'));

try {
    const objectStore = new FilesystemObjectStore(root);
    const resultSets = new ResultSetArtifactStore(objectStore, 'artifacts');
    const rows = [{ id: 1, revenue: 1200 }];
    const preview = buildResultSetPreview({
        columns: [
            { name: 'id', logicalType: 'number' },
            { name: 'revenue', logicalType: 'number' },
        ],
        rows,
    });
    const manifest: ResultSetManifest = {
        format: 'dory.resultset.v1',
        artifactId: 'rs_test',
        organizationId: 'org_test',
        kind: 'sql-result-set',
        status: 'success',
        source: { type: 'query-run', queryRunId: 'qr_test' },
        schema: preview.columns,
        rowCount: rows.length,
        previewRowCount: preview.previewRowCount,
        limited: false,
        files: {},
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
    };

    const data = Buffer.from('PAR1-test');
    const { ref } = await resultSets.putResultSet({ organizationId: 'org_test', artifactId: 'rs_test', manifest, preview, data });
    assert.equal(ref.basePath, 'artifacts/org_test/result-sets/rs_test');
    assert.equal(ref.dataPath, 'data.parquet');
    assert.equal(ref.dataAvailability, 'full');
    assert.deepEqual((await resultSets.readPreview(ref))?.rows, rows);
    const savedManifest = await resultSets.readManifest(ref);
    assert.equal(savedManifest.format, 'dory.resultset.v1');
    assert.equal(savedManifest.files.data?.path, 'data.parquet');
    assert.equal(savedManifest.files.data?.byteSize, data.byteLength);
    assert.equal(resultSetDataAvailability(savedManifest), 'full');
    assert.deepEqual(await readableToBuffer((await resultSets.openData(ref))!), data);

    const agentRuns = new AgentRunArtifactStore(objectStore, 'artifacts');
    const runRef = agentRuns.ref('org_test', 'run_test');
    await agentRuns.appendEvent(runRef, { step: 1 });
    await agentRuns.appendEvent(runRef, { step: 2 });
    const events: unknown[] = [];
    for await (const event of agentRuns.readEvents(runRef)) events.push(event);
    assert.deepEqual(events, [{ step: 1 }, { step: 2 }]);

    await resultSets.deleteResultSet(ref);
    assert.equal(await resultSets.exists(ref), false);
} finally {
    await rm(root, { recursive: true, force: true });
}

const s3Objects = new Map<string, { body: Buffer; updatedAt: Date; contentType?: string }>();
const s3Client = {
    async send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
        const key = String(command.input.Key ?? '');
        switch (command.constructor.name) {
            case 'PutObjectCommand': {
                const body = Buffer.isBuffer(command.input.Body) ? command.input.Body : Buffer.from(command.input.Body as Uint8Array);
                s3Objects.set(key, { body, updatedAt: new Date(), contentType: command.input.ContentType as string | undefined });
                return {};
            }
            case 'GetObjectCommand': {
                const object = s3Objects.get(key);
                if (!object) throw Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
                return { Body: Readable.from(object.body) };
            }
            case 'HeadObjectCommand': {
                const object = s3Objects.get(key);
                if (!object) throw Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
                return { ContentLength: object.body.byteLength, LastModified: object.updatedAt };
            }
            case 'ListObjectsV2Command': {
                const prefix = String(command.input.Prefix ?? '');
                return {
                    Contents: [...s3Objects.entries()]
                        .filter(([objectKey]) => objectKey.startsWith(prefix))
                        .map(([objectKey, object]) => ({
                            Key: objectKey,
                            Size: object.body.byteLength,
                            LastModified: object.updatedAt,
                        })),
                    IsTruncated: false,
                };
            }
            case 'DeleteObjectCommand':
                s3Objects.delete(key);
                return {};
            default:
                throw new Error(`Unexpected S3 command: ${command.constructor.name}`);
        }
    },
};

const s3Store = new S3CompatibleObjectStore({ bucket: 'test', region: 'us-east-1' }, s3Client as never);
const s3ResultSets = new ResultSetArtifactStore(s3Store, 'artifacts');
const s3Preview = buildResultSetPreview({ columns: [{ name: 'id', logicalType: 'number' }], rows: [{ id: 1 }] });
const s3Manifest: ResultSetManifest = {
    format: 'dory.resultset.v1',
    artifactId: 'rs_s3',
    organizationId: 'org_test',
    kind: 'sql-result-set',
    status: 'success',
    source: { type: 'query-run', queryRunId: 'qr_s3' },
    schema: s3Preview.columns,
    rowCount: 1,
    previewRowCount: s3Preview.previewRowCount,
    limited: false,
    files: {},
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
};
const s3Data = Buffer.from('PAR1-s3-test');
const { ref: s3Ref } = await s3ResultSets.putResultSet({ organizationId: 'org_test', artifactId: 'rs_s3', manifest: s3Manifest, preview: s3Preview, data: s3Data });
assert.equal(s3Ref.store, 's3');
assert.equal((await s3ResultSets.readManifest(s3Ref)).files.data?.byteSize, s3Data.byteLength);
assert.deepEqual(await readableToBuffer((await s3ResultSets.openData(s3Ref))!), s3Data);
await s3ResultSets.deleteResultSet(s3Ref);
assert.equal(await s3ResultSets.exists(s3Ref), false);
