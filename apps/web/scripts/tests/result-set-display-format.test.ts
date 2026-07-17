import assert from 'node:assert/strict';
import test from 'node:test';

import {
    formatBytes,
    formatCompactDuration,
    formatRelativeTimestamp,
    formatResultSetSource,
    getResultSetStorageLabel,
} from '../../app/(app)/[organization]/[connectionId]/sql-console/components/result-table/utils/format';

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

test('formats source and storage metadata', () => {
    assert.equal(formatResultSetSource('sqlite', 'main'), 'SQLite / main');
    assert.equal(formatResultSetSource(null, null), '—');
    assert.equal(getResultSetStorageLabel({ artifactStore: 'filesystem', storageFormat: 'parquet', dataAvailability: 'full' }), 'LocalParquet');
    assert.equal(getResultSetStorageLabel({ artifactStore: 's3', storageFormat: 'json', dataAvailability: 'preview-only' }), 'S3JsonPreview');
    assert.equal(getResultSetStorageLabel({ artifactStore: 'filesystem', storageFormat: null, dataAvailability: 'none' }), 'NotRetained');
});
