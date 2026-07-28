import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveResultLoadingMode, shouldShowResultMetadataLoading } from '../../app/(app)/[organization]/[connectionId]/sql-console/components/result-table/result-loading-mode';

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

test('shows loading while a newly selected session is hydrating result metadata', () => {
    assert.equal(
        shouldShowResultMetadataLoading({
            sessionId: 'session-with-artifact',
            loadedSessionId: null,
            hasCachedMetadata: false,
            activeSet: -1,
        }),
        true,
    );
});

test('does not show metadata loading after hydration or on a cache hit', () => {
    assert.equal(
        shouldShowResultMetadataLoading({
            sessionId: 'session-with-artifact',
            loadedSessionId: 'session-with-artifact',
            hasCachedMetadata: false,
            activeSet: -1,
        }),
        false,
    );
    assert.equal(
        shouldShowResultMetadataLoading({
            sessionId: 'session-with-artifact',
            loadedSessionId: null,
            hasCachedMetadata: true,
            activeSet: -1,
        }),
        false,
    );
});

test('does not show persisted-result restoration during a live execution', () => {
    assert.equal(
        shouldShowResultMetadataLoading({
            sessionId: 'live-session',
            loadedSessionId: null,
            hasCachedMetadata: false,
            activeSet: 1,
            activeMetaSessionId: null,
            activeMetaSetIndex: null,
            isLiveExecution: true,
        }),
        false,
    );
});

test('keeps loading when the selected artifact metadata has not hydrated yet', () => {
    assert.equal(
        shouldShowResultMetadataLoading({
            sessionId: 'session-with-artifact',
            loadedSessionId: 'session-with-artifact',
            hasCachedMetadata: true,
            activeSet: 0,
            activeMetaSessionId: 'previous-session',
            activeMetaSetIndex: 0,
        }),
        true,
    );
    assert.equal(
        shouldShowResultMetadataLoading({
            sessionId: 'session-with-artifact',
            loadedSessionId: 'session-with-artifact',
            hasCachedMetadata: true,
            activeSet: 0,
            activeMetaSessionId: 'session-with-artifact',
            activeMetaSetIndex: 0,
        }),
        false,
    );
});
