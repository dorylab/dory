import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ComparisonArtifactStore, FilesystemObjectStore, type ObjectStore } from '@dory/artifacts';
import { compareSchemaSnapshots, finalizeSchemaSnapshot } from '@dory/schema-compare';

test('comparison artifact store commits immutable run files with manifest last', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dory-schema-compare-artifacts-'));
    try {
        const objects = new FilesystemObjectStore(directory);
        const writes: string[] = [];
        const recordingStore: ObjectStore = {
            kind: objects.kind,
            put: async (objectPath, body, options) => {
                await objects.put(objectPath, body, options);
                writes.push(objectPath);
            },
            get: objectPath => objects.get(objectPath),
            exists: objectPath => objects.exists(objectPath),
            delete: objectPath => objects.delete(objectPath),
            list: prefix => objects.list(prefix),
            deletePrefix: prefix => objects.deletePrefix(prefix),
            stat: objectPath => objects.stat(objectPath),
        };
        const store = new ComparisonArtifactStore(recordingStore, '');
        const snapshot = finalizeSchemaSnapshot({
            family: 'postgres',
            engine: 'postgres',
            database: 'app',
            schemas: ['public'],
            capturedAt: '2026-07-23T00:00:00.000Z',
            coverage: {
                tables: 'complete',
                columns: 'complete',
                indexes: 'complete',
                constraints: 'complete',
                views: 'complete',
                statistics: 'complete',
            },
            tables: [],
            views: [],
        });
        const comparison = compareSchemaSnapshots(snapshot, snapshot);
        const runRef = await store.putRun({
            organizationId: 'org_1',
            comparisonId: 'cmp_1',
            runId: 'cmprun_1',
            configuration: {
                version: 1,
                configurationVersion: 1,
                name: 'Production vs Staging',
                source: { connectionId: 'conn_source', identityId: null, database: 'app' },
                target: { connectionId: 'conn_target', identityId: null, database: 'app' },
                schemaFilter: ['public'],
                objectTypes: ['table', 'column', 'index', 'constraint', 'view'],
                dialectFamily: 'postgres',
            },
            source: snapshot,
            target: snapshot,
            comparison,
        });
        assert.equal(writes.at(-1), `${runRef.basePath}/${runRef.manifestPath}`);
        assert.match(runRef.basePath, /comparisons\/cmp_1\/runs\/cmprun_1$/);
        assert.deepEqual((await store.readRun(runRef)).comparison, comparison);
        await assert.rejects(
            store.putRun({
                organizationId: 'org_1',
                comparisonId: 'cmp_1',
                runId: 'cmprun_1',
                configuration: {},
                source: snapshot,
                target: snapshot,
                comparison,
            }),
            /immutable/,
        );
        await store.putAiReview(runRef, { summary: 'Safe to deploy.' });
        assert.equal(await objects.exists(`${runRef.basePath}/${runRef.aiReviewPath}`), true);

        await store.deleteComparisonById('org_1', 'cmp_1');
        assert.equal(await objects.exists(`${runRef.basePath}/${runRef.manifestPath}`), false);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
