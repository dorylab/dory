import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { AgentRunArtifactStore, FilesystemObjectStore, ResultSetArtifactStore } from '../../src/index';
import { buildResultSetPreview, type ResultSetManifest } from '@dory/resultset';

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

    const { ref } = await resultSets.putResultSet({ organizationId: 'org_test', artifactId: 'rs_test', manifest, preview });
    assert.equal(ref.basePath, 'artifacts/org_test/result-sets/rs_test');
    assert.deepEqual((await resultSets.readPreview(ref))?.rows, rows);
    assert.equal((await resultSets.readManifest(ref)).format, 'dory.resultset.v1');

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
