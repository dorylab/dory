import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ComparisonArtifactStore, FilesystemObjectStore } from '@dory/artifacts';
import { finalizeSchemaSnapshot } from '@dory/schema-compare';

test('comparison artifact store persists and cleans immutable snapshots', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dory-schema-compare-artifacts-'));
    try {
        const objects = new FilesystemObjectStore(directory);
        const store = new ComparisonArtifactStore(objects, '');
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
        const ref = await store.putSnapshots({
            organizationId: 'org_1',
            comparisonId: 'cmp_1',
            current: snapshot,
            desired: snapshot,
        });
        assert.deepEqual(await store.readSnapshots(ref), { current: snapshot, desired: snapshot });
        await store.deleteComparison(ref);
        assert.equal(await objects.exists(`${ref.basePath}/${ref.currentPath}`), false);
        assert.equal(await objects.exists(`${ref.basePath}/${ref.desiredPath}`), false);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
