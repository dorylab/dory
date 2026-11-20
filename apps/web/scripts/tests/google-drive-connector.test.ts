import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { encrypt } from '@dory/web-utils/crypto';
import { DriveGrantRevoked, readDriveSnapshot } from '../../lib/server/google-drive';

test('Drive exports Docs as Markdown, pages through nested folders and rejects incomplete scans and revoked grants', async t => {
    process.env.GOOGLE_DRIVE_CLIENT_ID = 'test';
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = 'test';
    process.env.GOOGLE_DRIVE_REDIRECT_URI = 'http://localhost/callback';
    process.env.DS_SECRET_KEY = randomBytes(32).toString('base64');
    const encrypted = await encrypt('test-refresh');
    let failure = '';
    const folder = { mimeType: 'application/vnd.google-apps.folder', id: 'start', name: 'Team' };
    t.mock.method(globalThis, 'fetch', async (input: string, init: RequestInit) => {
        const url = new URL(input);
        if (url.hostname === 'oauth2.googleapis.com') {
            assert.equal(new URLSearchParams(String(init.body)).get('refresh_token'), 'test-refresh');
            if (failure === 'revoked') return Response.json({ error: 'invalid_grant' }, { status: 400 });
            return Response.json({ access_token: 'test-access' });
        }
        assert.equal(new Headers(init.headers).get('authorization'), 'Bearer test-access');
        if (url.pathname.endsWith('/start')) return Response.json(folder);
        if (url.pathname.endsWith('/doc/export')) {
            assert.equal(url.searchParams.get('mimeType'), 'text/markdown');
            return new Response('# Title');
        }
        if (url.pathname.endsWith('/md')) return new Response('notes');
        if (url.searchParams.get('pageToken')) return Response.json({ files: [{ id: 'md', name: 'guide.md', mimeType: 'text/plain' }] });
        if (url.searchParams.get('q')?.includes("'sub'"))
            return Response.json({ incompleteSearch: failure === 'partial', files: [{ id: 'doc', name: 'Title', mimeType: 'application/vnd.google-apps.document' }] });
        return Response.json({ files: [{ ...folder, id: 'sub', name: 'Team notes' }], nextPageToken: 'next' });
    });
    const { files } = await readDriveSnapshot(encrypted, 'start');
    assert.equal(files.length, 2);
    assert.deepEqual(files.find(f => f.path === 'doc')?.folderTrail, [{ id: 'sub', name: 'Team notes' }]);
    assert.equal(files.find(f => f.path === 'doc')?.contentText, '# Title');
    assert.equal(files.find(f => f.path === 'doc')?.sourceUrl, 'https://docs.google.com/document/d/doc/edit');
    failure = 'partial';
    await assert.rejects(readDriveSnapshot(encrypted, 'start'), /incomplete/);
    failure = 'revoked';
    await assert.rejects(readDriveSnapshot(encrypted, 'start'), DriveGrantRevoked);
});

test('OAuth binds the grant to the user and model, verifies PKCE and queues a first and hourly scan', async t => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    const { eq } = await import('drizzle-orm');
    const { createHash } = await import('node:crypto');
    const { decrypt } = await import('@dory/web-utils/crypto');
    const { PostgresKnowledgeRepository } = await import('@dory/database/postgres/impl/knowledge');
    const { createOssieDocument } = await import('@dory/database/postgres/impl/knowledge/ossie');
    const { knowledgeModels, knowledgeConnectors } = await import('@dory/database/postgres/schemas');
    const { beginDriveAuthorization, finishDriveAuthorization } = await import('../../lib/server/google-drive');
    const client = new PGlite();
    try {
        const database = drizzle(client);
        await migrate(database, { migrationsFolder: new URL('../../../../packages/database/src/pglite/migrations', import.meta.url).pathname });
        const owner = { organizationId: 'org', knowledgeModelId: 'model', userId: 'owner' };
        const knowledge = new PostgresKnowledgeRepository();
        await knowledge.init(database as unknown as import('@dory/shared').PostgresDBClient);
        await database.insert(knowledgeModels).values({ id: 'model', name: 'Drive', organizationId: 'org', modelJson: createOssieDocument('Drive', null, 'connection') });
        process.env.GOOGLE_DRIVE_CLIENT_ID = 'test-client';
        process.env.GOOGLE_DRIVE_CLIENT_SECRET = 'test-secret';
        process.env.GOOGLE_DRIVE_REDIRECT_URI = 'http://localhost/api/knowledge/connectors/drive/callback';
        process.env.DS_SECRET_KEY = Buffer.alloc(32, 1).toString('base64');
        const flow = await beginDriveAuthorization({ knowledge }, owner);
        const params = new URL(flow.url).searchParams;
        assert.equal(params.get('scope'), 'https://www.googleapis.com/auth/drive.readonly');
        const state = params.get('state')!;
        assert.notEqual(flow.id, state);
        t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
            assert.equal(url, 'https://oauth2.googleapis.com/token');
            const form = new URLSearchParams(String(init.body));
            assert.equal(form.get('redirect_uri'), params.get('redirect_uri'));
            assert.equal(createHash('sha256').update(form.get('code_verifier')!).digest('base64url'), params.get('code_challenge'));
            return Response.json({ access_token: 'sample-access', refresh_token: 'sample-refresh' });
        });
        await finishDriveAuthorization({ knowledge }, state, 'sample-code');
        await assert.rejects(finishDriveAuthorization({ knowledge }, state, 'sample-code'));
        const session = await knowledge.getDriveAuthorization({ ...owner, id: flow.id });
        assert.equal(await decrypt(session.refreshTokenEncrypted!), 'sample-refresh');
        const connector = await knowledge.connectDriveFolder({ ...owner, id: flow.id, folderId: 'remote-root', name: 'Team' });
        const first = await knowledge.claimConnectorSyncJob();
        assert.equal(first?.connectorId, connector.id);
        await knowledge.applyConnectorSnapshot({ connectorId: connector.id, jobId: first!.id, leaseToken: first!.leaseToken!, files: [] });
        await knowledge.finishConnectorSyncJob({ connectorId: connector.id, jobId: first!.id, leaseToken: first!.leaseToken! });
        await knowledge.queueDueConnectors('drive');
        assert.equal(await knowledge.claimConnectorSyncJob(), null);
        await database
            .update(knowledgeConnectors)
            .set({ nextSyncAt: new Date(0) })
            .where(eq(knowledgeConnectors.id, connector.id));
        await knowledge.queueDueConnectors('drive');
        assert.equal((await knowledge.claimConnectorSyncJob())?.connectorId, connector.id);
        const cancelled = await beginDriveAuthorization({ knowledge }, owner);
        await assert.rejects(finishDriveAuthorization({ knowledge }, new URL(cancelled.url).searchParams.get('state')!, null));
        assert.equal((await knowledge.getDriveAuthorization({ ...owner, id: cancelled.id })).refreshTokenEncrypted, null);
    } finally {
        await client.close();
    }
});
