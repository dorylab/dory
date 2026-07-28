type ResultLoadingModeInput = {
    status?: string | null;
    dataAvailability?: string | null;
    rowCount: number | null;
    previewRowCount: number;
};

export function resolveResultLoadingMode({ status, dataAvailability, rowCount, previewRowCount }: ResultLoadingModeInput) {
    const isPreparingFullResult = status === 'running' && dataAvailability === 'preview-only';
    const hasCompletePreview = !isPreparingFullResult && rowCount !== null && previewRowCount >= rowCount;
    const shouldUseRemoteFullResult = dataAvailability === 'full' && !hasCompletePreview;
    const shouldPrefetchRemoteResult = isPreparingFullResult || shouldUseRemoteFullResult;

    return {
        isPreparingFullResult,
        hasCompletePreview,
        shouldPrefetchRemoteResult,
        shouldUseRemoteFullResult,
    };
}

export function shouldShowResultMetadataLoading(params: {
    sessionId?: string | null;
    loadedSessionId?: string | null;
    hasCachedMetadata: boolean;
    activeSet: number;
    activeMetaSessionId?: string | null;
    activeMetaSetIndex?: number | null;
    isLiveExecution?: boolean;
}) {
    if (!params.sessionId) return false;
    if (params.isLiveExecution) return false;

    const isSessionMetadataPending = params.loadedSessionId !== params.sessionId && !params.hasCachedMetadata;
    const isActiveResultMetadataPending = params.activeSet >= 0 && (params.activeMetaSessionId !== params.sessionId || params.activeMetaSetIndex !== params.activeSet);

    return isSessionMetadataPending || isActiveResultMetadataPending;
}
