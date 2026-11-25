import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { decrypt } from '@dory/shared/utils/crypto';
import { NextRequest } from 'next/server';

const require = createRequire(import.meta.url);
const filename = require.resolve('server-only');
require.cache[filename] = { id: filename, filename, loaded: true, exports: {} } as NodeJS.Module;
const { captureDocumentGenerationRequest, restoreDocumentGenerationRequest } = await import('../../lib/server/knowledge-document-generation-context');

test('background cloud credentials survive encrypted storage with only session tokens and authorization', async () => {
    const req = new NextRequest('http://localhost:3000/api/actions/execute', {
        headers: {
            authorization: 'Bearer test-cloud-authorization',
            cookie: 'analytics=tracking; better-auth.session_token=test-session; better-auth.session_data=private-profile; dory.desktop_session_token=desktop-session',
            'x-unrelated': 'do-not-store',
        },
    });
    const encrypted = await captureDocumentGenerationRequest(req);
    assert.ok(!encrypted.includes('test-cloud-authorization') && !encrypted.includes('test-session'));
    assert.deepEqual(JSON.parse(await decrypt(encrypted)), {
        origin: 'http://localhost:3000',
        headers: { authorization: 'Bearer test-cloud-authorization', cookie: 'better-auth.session_token=test-session; dory.desktop_session_token=desktop-session' },
    });
    const restored = await restoreDocumentGenerationRequest(encrypted);
    assert.equal(restored?.url, req.url);
    assert.equal(restored?.headers.get('authorization'), 'Bearer test-cloud-authorization');
    assert.equal(restored?.headers.get('x-unrelated'), null);
});

test('background local execution needs no saved request credentials', async () => {
    assert.equal(await restoreDocumentGenerationRequest(null), undefined);
});

test('corrupt background credentials require fresh authentication', async () => {
    await assert.rejects(restoreDocumentGenerationRequest('corrupt encrypted credentials'), /AUTH_REQUIRED/);
});
