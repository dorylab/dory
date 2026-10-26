import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { ChatAttachmentStore, FilesystemObjectStore, S3CompatibleObjectStore, readableToBuffer, type ObjectStore } from '../../src/index';

async function check(store: ObjectStore) {
    const attachments = new ChatAttachmentStore(store);
    const owner = { organizationId: 'org', userId: 'user' };
    const payload = Buffer.from('id,active\n1,true\n2,false\n');
    const saved = await attachments.putStream(owner, {
        filename: 'customers.csv',
        mediaType: 'text/csv',
        chatId: null,
        stream: Readable.from([payload.subarray(0, 7), payload.subarray(7)]),
        maxBytes: payload.length,
    });
    assert.equal(saved.byteSize, payload.length);
    assert.equal(saved.sha256, createHash('sha256').update(payload).digest('hex'));
    assert.deepEqual(await readableToBuffer((await attachments.open(owner, saved.id)).stream), payload);
    await assert.rejects(attachments.get({ ...owner, userId: 'another' }, saved.id), /unavailable/);
    await attachments.bind(owner, saved.id, 'chat');
    await assert.rejects(attachments.bind(owner, saved.id, 'different-chat'), /another conversation/);
    assert.equal(await attachments.discardDraft(owner, saved.id), false);
    const count = async () => {
        const objects = [];
        for await (const entry of store.list('chat-attachments')) objects.push(entry);
        return objects.length;
    };
    const before = await count();
    await assert.rejects(attachments.putStream(owner, { filename: 'large.csv', mediaType: 'text/csv', chatId: null, stream: Readable.from([payload]), maxBytes: 1 }), /limit/);
    assert.equal(await count(), before);
    await assert.rejects(
        attachments.putStream(owner, {
            filename: 'broken.csv',
            mediaType: 'text/csv',
            chatId: null,
            stream: Readable.from(
                (async function* () {
                    yield payload;
                    throw new Error('upload canceled');
                })(),
            ),
            maxBytes: 100,
        }),
        /canceled/,
    );
    assert.equal(await count(), before);
    const draft = await attachments.put(owner, { filename: 'draft.csv', mediaType: 'text/csv', chatId: null, bytes: payload });
    assert.equal(await attachments.discardDraft(owner, draft.id), true);
    assert.equal(await count(), before);
}

test('private streaming attachment storage: filesystem and S3 HTTP adapter', async t => {
    const root = await mkdtemp(path.join(tmpdir(), 'dory-private-storage-'));
    try {
        await t.test('filesystem: checksum, ownership, binding and partial upload cleanup', () => check(new FilesystemObjectStore(root)));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
    const objects = new Map<string, Buffer>();
    const server = createServer(async (request, response) => {
        const url = new URL(request.url!, 'http://localhost');
        const key = decodeURIComponent(url.pathname.replace(/^\/bucket\/?/, ''));
        if (request.method === 'PUT') {
            objects.set(key, await readableToBuffer(request));
            response.writeHead(200, { ETag: '"test-etag"' }).end();
        } else if (request.method === 'DELETE') {
            objects.delete(key);
            response.writeHead(204).end();
        } else if (url.searchParams.has('list-type')) {
            const keys = [...objects.keys()].filter(value => value.startsWith(url.searchParams.get('prefix') ?? ''));
            response
                .writeHead(200, { 'Content-Type': 'application/xml' })
                .end(
                    `<ListBucketResult><IsTruncated>false</IsTruncated>${keys.map(value => `<Contents><Key>${value}</Key><Size>${objects.get(value)!.length}</Size></Contents>`).join('')}</ListBucketResult>`,
                );
        } else {
            const data = objects.get(key);
            if (!data) {
                response.writeHead(404).end();
                return;
            }
            response.writeHead(200, { 'Content-Length': data.length });
            response.end(request.method === 'HEAD' ? undefined : data);
        }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const address = server.address();
        assert.ok(address && typeof address !== 'string');
        const store = new S3CompatibleObjectStore({
            bucket: 'bucket',
            region: 'us-east-1',
            endpoint: `http://127.0.0.1:${address.port}`,
            accessKeyId: 'fixture',
            secretAccessKey: 'fixture',
            forcePathStyle: true,
        });
        await t.test('S3: real SDK streaming requests, readback and failed upload cleanup', () => check(store));
    } finally {
        await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
    }
});
