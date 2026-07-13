import { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { objectBodyToBuffer, type ObjectInfo, type ObjectStat, type ObjectStore, type ObjectStoreBody, type ObjectStorePutOptions } from './object-store';

export type S3CompatibleObjectStoreConfig = {
    bucket: string;
    region: string;
    endpoint?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    forcePathStyle?: boolean;
};

export class S3CompatibleObjectStore implements ObjectStore {
    readonly kind = 's3' as const;
    private readonly client: S3Client;

    constructor(private readonly config: S3CompatibleObjectStoreConfig, client?: S3Client) {
        this.client =
            client ??
            new S3Client({
                region: config.region,
                endpoint: config.endpoint,
                forcePathStyle: config.forcePathStyle,
                credentials:
                    config.accessKeyId && config.secretAccessKey
                        ? {
                              accessKeyId: config.accessKeyId,
                              secretAccessKey: config.secretAccessKey,
                          }
                        : undefined,
            });
    }

    async put(path: string, body: ObjectStoreBody, options?: ObjectStorePutOptions): Promise<void> {
        await this.client.send(
            new PutObjectCommand({
                Bucket: this.config.bucket,
                Key: path,
                Body: body instanceof Readable ? body : await objectBodyToBuffer(body),
                ContentType: options?.contentType,
            }),
        );
    }

    async get(path: string): Promise<Readable> {
        const response = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: path }));
        if (!response.Body) throw new Error(`S3 object has no body: ${path}`);
        if (response.Body instanceof Readable) return response.Body;
        if ('transformToByteArray' in response.Body && typeof response.Body.transformToByteArray === 'function') {
            const bytes = await response.Body.transformToByteArray();
            return Readable.from(Buffer.from(bytes));
        }
        return Readable.from(response.Body as AsyncIterable<Uint8Array>);
    }

    async exists(path: string): Promise<boolean> {
        return (await this.stat(path)) !== null;
    }

    async delete(path: string): Promise<void> {
        await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: path }));
    }

    async *list(prefix: string): AsyncIterable<ObjectInfo> {
        let continuationToken: string | undefined;
        do {
            const response = await this.client.send(new ListObjectsV2Command({ Bucket: this.config.bucket, Prefix: prefix, ContinuationToken: continuationToken }));
            for (const item of response.Contents ?? []) {
                if (!item.Key) continue;
                yield {
                    path: item.Key,
                    byteSize: item.Size,
                    updatedAt: item.LastModified,
                };
            }
            continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
        } while (continuationToken);
    }

    async deletePrefix(prefix: string): Promise<void> {
        for await (const item of this.list(prefix)) {
            await this.delete(item.path);
        }
    }

    async stat(path: string): Promise<ObjectStat | null> {
        try {
            const response = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: path }));
            return {
                byteSize: response.ContentLength,
                updatedAt: response.LastModified,
            };
        } catch (error: unknown) {
            if (isNotFound(error)) return null;
            throw error;
        }
    }
}

function isNotFound(error: unknown) {
    if (!error || typeof error !== 'object') return false;
    const name = 'name' in error ? error.name : undefined;
    const statusCode = '$metadata' in error && error.$metadata && typeof error.$metadata === 'object' && 'httpStatusCode' in error.$metadata ? error.$metadata.httpStatusCode : undefined;
    return name === 'NotFound' || statusCode === 404;
}
