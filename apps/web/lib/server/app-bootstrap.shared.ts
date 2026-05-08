import { getDesktopCloudStateFromFlags } from '@/lib/runtime/cloud-capabilities';

export function resolveAppBootstrapCloudCapabilities(options: {
    runtime: string | null;
    hasCloudBaseUrl: boolean;
    isOffline?: boolean;
}) {
    return getDesktopCloudStateFromFlags({
        runtime: options.runtime,
        hasCloudBaseUrl: options.hasCloudBaseUrl,
        isOffline: options.isOffline ?? false,
    });
}
