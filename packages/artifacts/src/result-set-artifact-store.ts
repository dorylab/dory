import { Readable } from 'node:stream';
import { resultSetDataAvailability, type ResultSetArtifactRef, type ResultSetManifest, type ResultSetPreview } from '@dory/resultset';

import { joinObjectPath, readableToBuffer, safeObjectPathPart, type ObjectStore } from './object-store';

export type PutResultSetArtifactInput = {
    organizationId: string;
    artifactId: string;
    manifest: ResultSetManifest;
    preview?: ResultSetPreview | null;
    data?: Buffer | Uint8Array | Readable | null;
};

export class ResultSetArtifactStore {
    constructor(
        private readonly objectStore: ObjectStore,
        private readonly prefix = 'artifacts',
    ) {}

    async putResultSet(input: PutResultSetArtifactInput): Promise<{ ref: ResultSetArtifactRef; manifest: ResultSetManifest }> {
        const basePath = this.basePath(input.organizationId, input.artifactId);
        const manifestPath = joinObjectPath(basePath, 'manifest.json');
        const previewPath = input.preview ? joinObjectPath(basePath, 'preview.json') : undefined;
        const dataPath = input.data ? joinObjectPath(basePath, 'data.parquet') : undefined;

        let previewByteSize: number | undefined;
        let dataByteSize: number | undefined;

        if (input.preview && previewPath) {
            const body = Buffer.from(JSON.stringify(input.preview), 'utf8');
            previewByteSize = body.byteLength;
            await this.objectStore.put(previewPath, body, { contentType: 'application/json' });
        }

        if (input.data && dataPath) {
            const body = Buffer.isBuffer(input.data) ? input.data : input.data instanceof Uint8Array ? Buffer.from(input.data) : await readableToBuffer(input.data);
            dataByteSize = body.byteLength;
            await this.objectStore.put(dataPath, body, { contentType: 'application/vnd.apache.parquet' });
        }

        const manifest: ResultSetManifest = {
            ...input.manifest,
            files: {
                preview: input.preview
                    ? {
                          path: 'preview.json',
                          format: 'json',
                          rowCount: input.preview.previewRowCount,
                          byteSize: previewByteSize,
                      }
                    : undefined,
                data: input.data
                    ? {
                          path: 'data.parquet',
                          format: 'parquet',
                          rowCount: input.manifest.rowCount ?? undefined,
                          byteSize: dataByteSize,
                      }
                    : undefined,
            },
        };

        await this.objectStore.put(manifestPath, Buffer.from(JSON.stringify(manifest), 'utf8'), { contentType: 'application/json' });

        const ref: ResultSetArtifactRef = {
            store: this.objectStore.kind,
            artifactId: input.artifactId,
            basePath,
            manifestPath: 'manifest.json',
            previewPath: input.preview ? 'preview.json' : undefined,
            dataPath: input.data ? 'data.parquet' : undefined,
            dataAvailability: resultSetDataAvailability(manifest),
        };

        return { ref, manifest };
    }

    async readManifest(ref: ResultSetArtifactRef): Promise<ResultSetManifest> {
        const body = await readableToBuffer(await this.objectStore.get(joinObjectPath(ref.basePath, ref.manifestPath)));
        return JSON.parse(body.toString('utf8')) as ResultSetManifest;
    }

    async readPreview(ref: ResultSetArtifactRef): Promise<ResultSetPreview | null> {
        if (!ref.previewPath) return null;
        const objectPath = joinObjectPath(ref.basePath, ref.previewPath);
        if (!(await this.objectStore.exists(objectPath))) return null;
        const body = await readableToBuffer(await this.objectStore.get(objectPath));
        return JSON.parse(body.toString('utf8')) as ResultSetPreview;
    }

    async openData(ref: ResultSetArtifactRef): Promise<Readable | null> {
        if (!ref.dataPath) return null;
        const objectPath = joinObjectPath(ref.basePath, ref.dataPath);
        if (!(await this.objectStore.exists(objectPath))) return null;
        return this.objectStore.get(objectPath);
    }

    async deleteResultSet(ref: ResultSetArtifactRef): Promise<void> {
        await this.objectStore.deletePrefix(ref.basePath);
    }

    async exists(ref: ResultSetArtifactRef): Promise<boolean> {
        return this.objectStore.exists(joinObjectPath(ref.basePath, ref.manifestPath));
    }

    basePath(organizationId: string, artifactId: string) {
        return joinObjectPath(this.prefix, organizationPathPart(organizationId), 'result-sets', safeObjectPathPart(artifactId));
    }
}

function organizationPathPart(organizationId: string) {
    const safe = safeObjectPathPart(organizationId);
    return safe.startsWith('org_') ? safe : `org_${safe}`;
}
