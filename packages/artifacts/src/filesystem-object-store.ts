import path from 'node:path';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { objectBodyToBuffer, type ObjectInfo, type ObjectStat, type ObjectStore, type ObjectStoreBody, type ObjectStorePutOptions } from './object-store';

export class FilesystemObjectStore implements ObjectStore {
    readonly kind = 'filesystem' as const;

    constructor(private readonly rootDir: string) {}

    async put(objectPath: string, body: ObjectStoreBody, _options?: ObjectStorePutOptions): Promise<void> {
        const filePath = this.resolvePath(objectPath);
        await mkdir(path.dirname(filePath), { recursive: true });
        if (body instanceof Readable) {
            await pipeline(body, createWriteStream(filePath, { mode: 0o600 }));
            return;
        }
        await writeFile(filePath, await objectBodyToBuffer(body), { mode: 0o600 });
    }

    async get(objectPath: string): Promise<Readable> {
        return createReadStream(this.resolvePath(objectPath));
    }

    async exists(objectPath: string): Promise<boolean> {
        try {
            await stat(this.resolvePath(objectPath));
            return true;
        } catch (error: unknown) {
            if (isNotFound(error)) return false;
            throw error;
        }
    }

    async delete(objectPath: string): Promise<void> {
        await rm(this.resolvePath(objectPath), { force: true });
    }

    async *list(prefix: string): AsyncIterable<ObjectInfo> {
        const root = this.resolvePath(prefix);
        try {
            yield* this.walk(root);
        } catch (error: unknown) {
            if (isNotFound(error)) return;
            throw error;
        }
    }

    async deletePrefix(prefix: string): Promise<void> {
        await rm(this.resolvePath(prefix), { recursive: true, force: true });
    }

    async stat(objectPath: string): Promise<ObjectStat | null> {
        try {
            const info = await stat(this.resolvePath(objectPath));
            return { byteSize: info.size, updatedAt: info.mtime };
        } catch (error: unknown) {
            if (isNotFound(error)) return null;
            throw error;
        }
    }

    private resolvePath(objectPath: string) {
        const resolved = path.resolve(this.rootDir, objectPath);
        const root = path.resolve(this.rootDir);
        if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
            throw new Error(`Artifact path escapes storage root: ${objectPath}`);
        }
        return resolved;
    }

    private async *walk(dir: string): AsyncIterable<ObjectInfo> {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const entryPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                yield* this.walk(entryPath);
                continue;
            }
            if (!entry.isFile()) continue;
            const info = await stat(entryPath);
            yield {
                path: path.relative(this.rootDir, entryPath).split(path.sep).join('/'),
                byteSize: info.size,
                updatedAt: info.mtime,
            };
        }
    }
}

function isNotFound(error: unknown) {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}
