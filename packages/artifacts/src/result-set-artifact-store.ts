import { Readable } from 'node:stream';
import { resultSetDataAvailability, type ResultSetArtifactRef, type ResultSetFilePartManifest, type ResultSetManifest, type ResultSetPreview } from '@dory/resultset';

import { joinObjectPath, readableToBuffer, safeObjectPathPart, type ObjectStore } from './object-store';

export type PutResultSetArtifactInput = {
    organizationId: string;
    artifactId: string;
    manifest: ResultSetManifest;
    schema?: Buffer | Uint8Array | null;
    preview?: ResultSetPreview | null;
    dataParts?: Array<{
        path: string;
        rowCount?: number;
        byteSize?: number;
        data: Buffer | Uint8Array | Readable;
    }> | null;
};

export type ResultSetDataPart = ResultSetFilePartManifest & {
    stream: Readable;
};

export class ResultSetArtifactStore {
    constructor(
        private readonly objectStore: ObjectStore,
        private readonly prefix = 'artifacts',
    ) {}

    async putResultSet(input: PutResultSetArtifactInput): Promise<{ ref: ResultSetArtifactRef; manifest: ResultSetManifest }> {
        const basePath = this.basePath(input.organizationId, input.artifactId);
        const manifestPath = joinObjectPath(basePath, 'manifest.json');
        const schemaPath = input.schema ? joinObjectPath(basePath, 'schema.arrow') : undefined;
        const previewPath = input.preview ? joinObjectPath(basePath, 'preview.json') : undefined;
        const dataParts = input.dataParts?.length ? input.dataParts : [];
        const hadCommittedManifest = await this.objectStore.exists(manifestPath);
        const committedDataPaths = new Set<string>();
        if (hadCommittedManifest) {
            try {
                const previous = JSON.parse((await readableToBuffer(await this.objectStore.get(manifestPath))).toString('utf8')) as ResultSetManifest;
                for (const part of previous.files.data?.parts ?? []) committedDataPaths.add(joinObjectPath(basePath, normalizeDataPartPath(part.path)));
            } catch {
                // A readable manifest is the commit marker. If it is corrupt, new uncommitted data is still safe to discard.
            }
        }
        const writtenDataPaths: string[] = [];

        try {
            let schemaByteSize: number | undefined;
            let previewByteSize: number | undefined;
            const manifestDataParts: ResultSetFilePartManifest[] = [];

            if (input.schema && schemaPath) {
                schemaByteSize = input.schema.byteLength;
                await this.objectStore.put(schemaPath, input.schema, { contentType: 'application/vnd.apache.arrow.file' });
            }

            if (input.preview && previewPath) {
                const body = Buffer.from(JSON.stringify(input.preview), 'utf8');
                previewByteSize = body.byteLength;
                await this.objectStore.put(previewPath, body, { contentType: 'application/json' });
            }

            for (const part of dataParts) {
                const partPath = normalizeDataPartPath(part.path);
                const objectPath = joinObjectPath(basePath, partPath);
                let byteSize = part.byteSize ?? (Buffer.isBuffer(part.data) || part.data instanceof Uint8Array ? part.data.byteLength : undefined);
                await this.objectStore.put(objectPath, part.data, { contentType: 'application/vnd.apache.parquet' });
                writtenDataPaths.push(objectPath);
                if (typeof byteSize === 'undefined') {
                    byteSize = (await this.objectStore.stat(objectPath))?.byteSize;
                }
                manifestDataParts.push({
                    path: partPath,
                    format: 'parquet',
                    rowCount: part.rowCount,
                    byteSize,
                });
            }

            const dataRowCount = manifestDataParts.reduce((sum, part) => sum + (part.rowCount ?? 0), 0);
            const dataByteSize = manifestDataParts.reduce((sum, part) => sum + (part.byteSize ?? 0), 0);
            const artifactByteSize = (schemaByteSize ?? 0) + (previewByteSize ?? 0) + dataByteSize;
            const manifest: ResultSetManifest = {
                ...input.manifest,
                byteSize: artifactByteSize,
                files: {
                    schema: input.schema
                        ? {
                              path: 'schema.arrow',
                              format: 'arrow',
                              byteSize: schemaByteSize,
                          }
                        : undefined,
                    preview: input.preview
                        ? {
                              path: 'preview.json',
                              format: 'json',
                              rowCount: input.preview.previewRowCount,
                              byteSize: previewByteSize,
                          }
                        : undefined,
                    data: manifestDataParts.length
                        ? {
                              path: 'data',
                              format: 'parquet',
                              rowCount: dataRowCount,
                              byteSize: dataByteSize,
                              parts: manifestDataParts,
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
                schemaPath: input.schema ? 'schema.arrow' : undefined,
                previewPath: input.preview ? 'preview.json' : undefined,
                dataPath: manifestDataParts.length ? 'data' : undefined,
                dataAvailability: resultSetDataAvailability(manifest),
            };

            return { ref, manifest };
        } catch (error) {
            if (!hadCommittedManifest) {
                await this.objectStore.deletePrefix(basePath).catch(() => undefined);
            } else {
                await Promise.all(
                    writtenDataPaths.filter(objectPath => !committedDataPaths.has(objectPath)).map(objectPath => this.objectStore.delete(objectPath).catch(() => undefined)),
                );
            }
            throw error;
        }
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

    async readSchema(ref: ResultSetArtifactRef): Promise<Buffer | null> {
        if (!ref.schemaPath) return null;
        const objectPath = joinObjectPath(ref.basePath, ref.schemaPath);
        if (!(await this.objectStore.exists(objectPath))) return null;
        return readableToBuffer(await this.objectStore.get(objectPath));
    }

    async openDataParts(ref: ResultSetArtifactRef, manifest: ResultSetManifest): Promise<ResultSetDataPart[]> {
        const parts = manifest.files.data?.parts ?? [];
        if (!ref.dataPath || !parts.length) return [];
        const streams: ResultSetDataPart[] = [];
        for (const part of parts) {
            const partPath = normalizeDataPartPath(part.path);
            const objectPath = joinObjectPath(ref.basePath, partPath);
            if (!(await this.objectStore.exists(objectPath))) {
                throw new Error(`Result-set data part is missing: ${partPath}`);
            }
            streams.push({
                path: partPath,
                format: 'parquet',
                rowCount: part.rowCount,
                byteSize: part.byteSize,
                stream: await this.objectStore.get(objectPath),
            });
        }
        return streams;
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

function normalizeDataPartPath(value: string) {
    const path = joinObjectPath(value);
    if (!path.startsWith('data/')) {
        throw new Error(`Invalid result-set data part path: ${value}`);
    }
    if (path.split('/').some(part => part === '..')) {
        throw new Error(`Invalid result-set data part path: ${value}`);
    }
    return path;
}
