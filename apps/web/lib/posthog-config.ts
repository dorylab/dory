import { getRuntimeForServer } from '@dory/shared/runtime';

export const posthogEnvironment = process.env.NODE_ENV ?? 'development';

export const posthogBaseProperties = {
    environment: posthogEnvironment,
};

export function getPostHogServerProperties() {
    return {
        ...posthogBaseProperties,
        runtime: getRuntimeForServer() ?? 'web',
    };
}

export const isPostHogEnabled =
    Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY) &&
    Boolean(process.env.NEXT_PUBLIC_POSTHOG_HOST);
