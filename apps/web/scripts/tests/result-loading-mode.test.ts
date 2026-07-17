import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveResultLoadingMode } from '../../app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-loading-mode';

test('keeps the preview visible while the full result is being prepared', () => {
    assert.deepEqual(
        resolveResultLoadingMode({
            status: 'running',
            dataAvailability: 'preview-only',
            rowCount: 1_000,
            previewRowCount: 1_000,
        }),
        {
            isPreparingFullResult: true,
            hasCompletePreview: false,
            shouldPrefetchRemoteResult: true,
            shouldUseRemoteFullResult: false,
        },
    );
});

test('switches to the remote result as soon as the full artifact is ready', () => {
    assert.deepEqual(
        resolveResultLoadingMode({
            status: 'success',
            dataAvailability: 'full',
            rowCount: 10_000,
            previewRowCount: 1_000,
        }),
        {
            isPreparingFullResult: false,
            hasCompletePreview: false,
            shouldPrefetchRemoteResult: true,
            shouldUseRemoteFullResult: true,
        },
    );
});

test('continues using the preview when it already contains the full result', () => {
    assert.deepEqual(
        resolveResultLoadingMode({
            status: 'success',
            dataAvailability: 'full',
            rowCount: 1_000,
            previewRowCount: 1_000,
        }),
        {
            isPreparingFullResult: false,
            hasCompletePreview: true,
            shouldPrefetchRemoteResult: false,
            shouldUseRemoteFullResult: false,
        },
    );
});

test('does not poll forever when storage only retains a preview', () => {
    assert.deepEqual(
        resolveResultLoadingMode({
            status: 'success',
            dataAvailability: 'preview-only',
            rowCount: 10_000,
            previewRowCount: 1_000,
        }),
        {
            isPreparingFullResult: false,
            hasCompletePreview: false,
            shouldPrefetchRemoteResult: false,
            shouldUseRemoteFullResult: false,
        },
    );
});
