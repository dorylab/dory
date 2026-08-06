import { Readable } from 'node:stream';

import { joinObjectPath, safeObjectPathPart, type ObjectStore, type ObjectStoreBody } from './object-store';

export class ExportRunArtifactStore {
    constructor(
        private readonly objectStore: ObjectStore,
        private readonly storagePrefix = '',
    ) {}

    paths(organizationId: string, runId: string, fileName: string) {
        const prefix = joinObjectPath(this.storagePrefix, safeObjectPathPart(organizationId), 'export-runs', safeObjectPathPart(runId));
        return {
            prefix,
            output: joinObjectPath(prefix, 'output', safeObjectPathPart(fileName)),
            manifest: joinObjectPath(prefix, 'manifest.json'),
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

    stat(path: string) {
        return this.objectStore.stat(path);
    }

    exists(path: string) {
        return this.objectStore.exists(path);
    }

    delete(path: string) {
        return this.objectStore.delete(path);
    }

    deleteRun(organizationId: string, runId: string) {
        return this.objectStore.deletePrefix(this.paths(organizationId, runId, 'output').prefix);
    }
}
