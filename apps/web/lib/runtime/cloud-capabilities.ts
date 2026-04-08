export function getDesktopCloudStateFromFlags(options: { runtime?: string | null; hasCloudBaseUrl?: boolean; isOffline?: boolean }) {
    const runtime = options.runtime ?? null;
    const hasCloudBaseUrl = options.hasCloudBaseUrl ?? false;
    const isOffline = options.isOffline ?? false;

    if (runtime !== 'desktop') {
        return {
            isOffline: false,
            canUseCloudFeatures: true,
        };
    }

    if (!hasCloudBaseUrl) {
        return {
            isOffline: false,
            canUseCloudFeatures: false,
        };
    }

    return {
        isOffline,
        canUseCloudFeatures: !isOffline,
    };
}
