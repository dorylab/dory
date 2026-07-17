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
