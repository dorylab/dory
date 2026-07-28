import path from 'node:path';

import { AgentRunArtifactStore } from './agent-run-artifact-store';
import { ComparisonArtifactStore } from './comparison-artifact-store';
import { FilesystemObjectStore } from './filesystem-object-store';
import { type ObjectStore } from './object-store';
import { ResultSetArtifactStore } from './result-set-artifact-store';
import { S3CompatibleObjectStore } from './s3-object-store';

export * from './agent-run-artifact-store';
export * from './comparison-artifact-store';
export * from './filesystem-object-store';
export * from './object-store';
export * from './result-set-artifact-store';
export * from './s3-object-store';

export type DoryArtifactStore = {
    objectStore: ObjectStore;
    resultSets: ResultSetArtifactStore;
    agentRuns: AgentRunArtifactStore;
    comparisons: ComparisonArtifactStore;
};

let singleton: DoryArtifactStore | null = null;

export function getDoryArtifactStore(): DoryArtifactStore {
    singleton ??= createDoryArtifactStore();
    return singleton;
}

export function createDoryArtifactStore(): DoryArtifactStore {
    const store = process.env.DORY_ARTIFACTS_STORE?.trim() || 'filesystem';
    const prefix = resolvePrefix(store);
    const objectStore = createObjectStoreFromEnv();
    return {
        objectStore,
        resultSets: new ResultSetArtifactStore(objectStore, prefix),
        agentRuns: new AgentRunArtifactStore(objectStore, prefix),
        comparisons: new ComparisonArtifactStore(objectStore, prefix),
    };
}

function resolvePrefix(store: string) {
    const configuredPrefix = process.env.DORY_ARTIFACTS_PREFIX?.trim() || process.env.DORY_ARTIFACTS_S3_PREFIX?.trim();
    if (typeof configuredPrefix === 'string') return configuredPrefix;
    return store === 's3' ? 'artifacts' : '';
}

function createObjectStoreFromEnv(): ObjectStore {
    const store = process.env.DORY_ARTIFACTS_STORE?.trim() || 'filesystem';
    if (store === 'filesystem') {
        return new FilesystemObjectStore(process.env.DORY_ARTIFACTS_FILESYSTEM_DIR?.trim() || path.join(process.cwd(), 'localdata', 'artifacts'));
    }

    if (store === 's3') {
        const bucket = requiredEnv('DORY_ARTIFACTS_S3_BUCKET');
        const region = requiredEnv('DORY_ARTIFACTS_S3_REGION');
        return new S3CompatibleObjectStore({
            bucket,
            region,
            endpoint: optionalEnv('DORY_ARTIFACTS_S3_ENDPOINT'),
            accessKeyId: optionalEnv('DORY_ARTIFACTS_S3_ACCESS_KEY_ID'),
            secretAccessKey: optionalEnv('DORY_ARTIFACTS_S3_SECRET_ACCESS_KEY'),
            forcePathStyle: parseBoolean(process.env.DORY_ARTIFACTS_S3_FORCE_PATH_STYLE) ?? Boolean(process.env.DORY_ARTIFACTS_S3_ENDPOINT),
        });
    }

    throw new Error(`Unsupported DORY_ARTIFACTS_STORE value: ${store}`);
}

function requiredEnv(name: string) {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is required when DORY_ARTIFACTS_STORE=s3`);
    return value;
}

function optionalEnv(name: string) {
    return process.env[name]?.trim() || undefined;
}

function parseBoolean(value: string | undefined) {
    if (!value) return undefined;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return undefined;
}
