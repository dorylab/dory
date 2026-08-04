import { Readable } from 'node:stream';

import { joinObjectPath, safeObjectPathPart, type ObjectStore, type ObjectStoreBody } from './object-store';

export type ImportRunArtifactPaths = {
    prefix: string;
    source: string;
    sourceArrow: string;
    preparedArrow: string;
    manifest: string;
    schema: string;
    profile: string;
    transform: string;
    events: string;
};

export class ImportRunArtifactStore {
    constructor(
        private readonly objectStore: ObjectStore,
        private readonly storagePrefix = '',
    ) {}

    paths(organizationId: string, runId: string, sourceExtension = 'csv'): ImportRunArtifactPaths {
        const prefix = joinObjectPath(this.storagePrefix, safeObjectPathPart(organizationId), 'import-runs', safeObjectPathPart(runId));
        const extension = sourceExtension.toLocaleLowerCase() === 'tsv' ? 'tsv' : 'csv';
        return {
            prefix,
            source: joinObjectPath(prefix, 'source', `original.${extension}`),
            sourceArrow: joinObjectPath(prefix, 'dataset', 'source.arrow'),
            preparedArrow: joinObjectPath(prefix, 'dataset', 'prepared.arrow'),
            manifest: joinObjectPath(prefix, 'manifest.json'),
            schema: joinObjectPath(prefix, 'schema.arrow'),
            profile: joinObjectPath(prefix, 'profile.json'),
            transform: joinObjectPath(prefix, 'transform.json'),
            events: joinObjectPath(prefix, 'events.jsonl'),
        };
    }

    put(path: string, body: ObjectStoreBody, contentType?: string) {
        return this.objectStore.put(path, body, { contentType });
    }

    putJson(path: string, value: unknown) {
        return this.put(path, `${JSON.stringify(value, null, 2)}\n`, 'application/json');
    }

    get(path: string): Promise<Readable> {
        return this.objectStore.get(path);
    }

    localPath(path: string): string | null {
        return this.objectStore.localPath?.(path) ?? null;
    }

    delete(path: string) {
        return this.objectStore.delete(path);
    }
}
