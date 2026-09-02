import assert from 'node:assert/strict';
import test from 'node:test';

import {
    formatBytes,
    formatCompactDuration,
    formatRelativeTimestamp,
    getResultSetStorageLabel,
} from '../../app/(app)/[organization]/[connectionId]/sql-console/components/result-table/utils/format';
import { formatArtifactRelativeTime, getArtifactFreshness, getArtifactListOrigin } from '../../lib/artifacts/list-display';

test('formats compact result set metrics', () => {
    assert.equal(formatCompactDuration(999), '999ms');
    assert.equal(formatCompactDuration(1_000), '1s');
    assert.equal(formatCompactDuration(10_700), '10.7s');
    assert.equal(formatBytes(184 * 1024 * 1024), '184 MB');
});

test('formats relative result set timestamps', () => {
    const now = Date.parse('2026-07-16T12:00:00.000Z');
    assert.equal(formatRelativeTimestamp(now - 2 * 60 * 1000, 'en', now), '2 minutes ago');
    assert.equal(formatRelativeTimestamp(now + 7 * 24 * 60 * 60 * 1000, 'en', now), 'in 7 days');
});

test('formats storage metadata', () => {
    assert.equal(getResultSetStorageLabel({ artifactStore: 'filesystem', storageFormat: 'parquet', dataAvailability: 'full' }), 'LocalParquet');
    assert.equal(getResultSetStorageLabel({ artifactStore: 's3', storageFormat: 'json', dataAvailability: 'preview-only' }), 'S3JsonPreview');
    assert.equal(getResultSetStorageLabel({ artifactStore: 'filesystem', storageFormat: null, dataAvailability: 'none' }), 'NotRetained');
});

test('formats agent-native Artifact list metadata', () => {
    const now = Date.parse('2026-09-02T12:00:00.000Z');
    assert.equal(getArtifactFreshness('2026-08-26T12:00:00.000Z', now), 'fresh');
    assert.equal(getArtifactFreshness('2026-08-03T12:00:00.000Z', now), 'aging');
    assert.equal(getArtifactFreshness('2026-08-01T11:59:59.000Z', now), 'stale');
    assert.equal(formatArtifactRelativeTime('2026-09-01T12:00:00.000Z', 'en', now), 'yesterday');
    assert.equal(getArtifactListOrigin({ agentRunId: 'work_1', comparisonId: null, sourceType: 'query-run' }), 'agent-run');
    assert.equal(getArtifactListOrigin({ agentRunId: null, comparisonId: null, sourceType: 'query-run' }), 'sql-workspace');
    assert.equal(getArtifactListOrigin({ agentRunId: null, comparisonId: 'cmp_1', sourceType: 'comparison' }), 'comparison');
    assert.equal(getArtifactListOrigin({ agentRunId: null, comparisonId: null, sourceType: null }), 'unknown');
});
