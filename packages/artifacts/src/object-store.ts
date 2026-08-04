import { Readable } from 'node:stream';

export type ObjectStorePutOptions = {
    contentType?: string;
};

export type ObjectInfo = {
    path: string;
    byteSize?: number;
    updatedAt?: Date;
};

export type ObjectStat = {
    byteSize?: number;
    updatedAt?: Date;
};

export type ObjectStoreBody = Uint8Array | Buffer | Readable | string;

export type ObjectStore = {
    readonly kind: 'filesystem' | 's3' | (string & {});
    put(path: string, body: ObjectStoreBody, options?: ObjectStorePutOptions): Promise<void>;
    get(path: string): Promise<Readable>;
    exists(path: string): Promise<boolean>;
    delete(path: string): Promise<void>;
    list(prefix: string): AsyncIterable<ObjectInfo>;
    deletePrefix(prefix: string): Promise<void>;
    stat(path: string): Promise<ObjectStat | null>;
    localPath?(path: string): string | null;
};

export async function objectBodyToBuffer(body: ObjectStoreBody): Promise<Buffer> {
    if (typeof body === 'string') return Buffer.from(body, 'utf8');
    if (Buffer.isBuffer(body)) return body;
    if (body instanceof Uint8Array) return Buffer.from(body);
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

export async function readableToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

export function joinObjectPath(...parts: string[]) {
    return parts
        .flatMap(part => part.split('/'))
        .map(part => part.trim())
        .filter(Boolean)
        .join('/');
}

export function safeObjectPathPart(value: string) {
    return value.replace(/[^a-zA-Z0-9_.-]/g, '_');
}
