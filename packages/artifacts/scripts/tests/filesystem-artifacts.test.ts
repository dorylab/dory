import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import {
    AgentRunArtifactStore,
    ExportRunArtifactStore,
    FilesystemObjectStore,
    readableToBuffer,
    ResultSetArtifactStore,
    S3CompatibleObjectStore,
    type ObjectStore,
} from '../../src/index';
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

    const dataPart = Buffer.from('PAR1-test');
    const schema = Buffer.from('ARROW1-schema');
    manifest.format = 'dory.resultset.v2';
    const { ref } = await resultSets.putResultSet({
        organizationId: 'org_test',
        artifactId: 'rs_test',
        manifest,
        schema,
        preview,
        dataParts: [{ path: 'data/part-00000.parquet', rowCount: rows.length, data: dataPart }],
    });
    assert.equal(ref.basePath, 'artifacts/org_test/result-sets/rs_test');
    assert.equal(ref.dataPath, 'data');
    assert.equal(ref.schemaPath, 'schema.arrow');
    assert.equal(ref.dataAvailability, 'full');
    assert.deepEqual((await resultSets.readPreview(ref))?.rows, rows);
    const savedManifest = await resultSets.readManifest(ref);
    assert.equal(savedManifest.format, 'dory.resultset.v2');
    assert.equal(savedManifest.files.schema?.path, 'schema.arrow');
    assert.equal(savedManifest.files.schema?.byteSize, schema.byteLength);
    assert.deepEqual(await resultSets.readSchema(ref), schema);
    assert.equal(savedManifest.files.data?.path, 'data');
    assert.equal(savedManifest.files.data?.byteSize, dataPart.byteLength);
    assert.equal(savedManifest.byteSize, schema.byteLength + (savedManifest.files.preview?.byteSize ?? 0) + dataPart.byteLength);
    assert.deepEqual(savedManifest.files.data?.parts, [{ path: 'data/part-00000.parquet', format: 'parquet', rowCount: rows.length, byteSize: dataPart.byteLength }]);
    assert.equal(resultSetDataAvailability(savedManifest), 'full');
    const parts = await resultSets.openDataParts(ref, savedManifest);
    assert.equal(parts.length, 1);
    assert.deepEqual(await readableToBuffer(parts[0]!.stream), dataPart);

    const failingStore: ObjectStore = {
        kind: objectStore.kind,
        put: async (objectPath, body, options) => {
            if (objectPath.endsWith('manifest.json')) throw new Error('manifest commit failed');
            await objectStore.put(objectPath, body, options);
        },
        get: objectPath => objectStore.get(objectPath),
        exists: objectPath => objectStore.exists(objectPath),
        delete: objectPath => objectStore.delete(objectPath),
        list: objectPath => objectStore.list(objectPath),
        deletePrefix: objectPath => objectStore.deletePrefix(objectPath),
        stat: objectPath => objectStore.stat(objectPath),
        localPath: objectPath => objectStore.localPath(objectPath),
    };
    const failingResultSets = new ResultSetArtifactStore(failingStore, 'artifacts');
    await assert.rejects(
        failingResultSets.putResultSet({
            organizationId: 'org_test',
            artifactId: 'rs_incomplete',
            manifest: { ...manifest, artifactId: 'rs_incomplete' },
            schema,
            preview,
            dataParts: [{ path: 'data/part-00000.parquet', rowCount: rows.length, data: dataPart }],
        }),
        /manifest commit failed/,
    );
    const incompleteBasePath = failingResultSets.basePath('org_test', 'rs_incomplete');
    const incompleteObjects: string[] = [];
    for await (const object of objectStore.list(incompleteBasePath)) incompleteObjects.push(object.path);
    assert.deepEqual(incompleteObjects, []);

    const agentRuns = new AgentRunArtifactStore(objectStore, 'artifacts');
    const runRef = agentRuns.ref('org_test', 'run_test');
    await agentRuns.appendEvent(runRef, { step: 1 });
    await agentRuns.appendEvent(runRef, { step: 2 });
    const events: unknown[] = [];
    for await (const event of agentRuns.readEvents(runRef)) events.push(event);
    assert.deepEqual(events, [{ step: 1 }, { step: 2 }]);

    const exportRuns = new ExportRunArtifactStore(objectStore, 'artifacts');
    const exportPaths = exportRuns.paths('org_test', 'export_test', 'orders.csv');
    await exportRuns.put(exportPaths.output, 'id,name\n1,Ada\n', 'text/csv');
    await exportRuns.putJson(exportPaths.manifest, { version: 1, runId: 'export_test' });
    assert.equal(exportPaths.output, 'artifacts/org_test/export-runs/export_test/output/orders.csv');
    assert.equal(await exportRuns.exists(exportPaths.manifest), true);
    await exportRuns.deleteRun('org_test', 'export_test');
    assert.equal(await exportRuns.exists(exportPaths.output), false);
    assert.equal(await exportRuns.exists(exportPaths.manifest), false);

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
const s3ExportRuns = new ExportRunArtifactStore(s3Store, 'artifacts');
const s3ExportPaths = s3ExportRuns.paths('org_test', 'export_s3', 'orders.arrow');
await s3ExportRuns.put(s3ExportPaths.output, Buffer.from('ARROW1'), 'application/vnd.apache.arrow.file');
await s3ExportRuns.putJson(s3ExportPaths.manifest, { version: 1, runId: 'export_s3' });
assert.deepEqual(await readableToBuffer(await s3ExportRuns.get(s3ExportPaths.output)), Buffer.from('ARROW1'));
await s3ExportRuns.deleteRun('org_test', 'export_s3');
assert.equal(await s3ExportRuns.exists(s3ExportPaths.manifest), false);
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
const { ref: s3Ref } = await s3ResultSets.putResultSet({
    organizationId: 'org_test',
    artifactId: 'rs_s3',
    manifest: s3Manifest,
    preview: s3Preview,
    dataParts: [{ path: 'data/part-00000.parquet', rowCount: 1, data: s3Data }],
});
assert.equal(s3Ref.store, 's3');
const savedS3Manifest = await s3ResultSets.readManifest(s3Ref);
assert.equal(savedS3Manifest.files.data?.byteSize, s3Data.byteLength);
const s3Parts = await s3ResultSets.openDataParts(s3Ref, savedS3Manifest);
assert.equal(s3Parts.length, 1);
assert.deepEqual(await readableToBuffer(s3Parts[0]!.stream), s3Data);
await s3ResultSets.deleteResultSet(s3Ref);
assert.equal(await s3ResultSets.exists(s3Ref), false);
