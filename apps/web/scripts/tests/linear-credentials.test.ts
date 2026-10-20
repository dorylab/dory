import assert from 'node:assert/strict';
import test from 'node:test';

import type { DBService } from '@dory/database';
import { decrypt, encrypt } from '@dory/web-utils/crypto';
import { LinearApiError } from '../../lib/server/linear-client';
import { saveLinearApiKey, withLinearAccess } from '../../lib/server/linear-credentials';

function configure() {
    process.env.DORY_RUNTIME = 'web';
    process.env.DS_SECRET_KEY = Buffer.alloc(32, 7).toString('base64');
}
const input = { organizationId: 'org', knowledgeModelId: 'model', apiKey: 'lin_api_test_private' };

test('API Key is verified using the raw header, encrypted before storage and omitted from public output', async () => {
    configure();
    let encrypted = '';
    const db = {
        knowledge: {
            getModel: async () => ({}),
            linear: {
                saveCredential: async (values: { apiKeyEncrypted: string }) => {
                    encrypted = values.apiKeyEncrypted;
                    return { ...values, id: 'credential', status: 'active', version: 1 };
                },
            },
        },
    } as unknown as DBService;
    const output = await saveLinearApiKey(db, input, {
        fetch: async (_url, init) => {
            assert.equal(new Headers(init?.headers).get('authorization'), input.apiKey);
            return Response.json({ data: { organization: { id: 'workspace', name: 'Workspace' } } });
        },
    });
    assert.equal(await decrypt(encrypted), input.apiKey);
    assert.equal(encrypted.includes(input.apiKey), false);
    assert.equal(JSON.stringify(output).includes(input.apiKey), false);
    assert.deepEqual(output, { id: 'credential', workspaceId: 'workspace', workspaceName: 'Workspace', status: 'active', version: 1 });
});

test('failed verification, network failures and workspace mismatch never replace the original key', async () => {
    configure();
    let saved = false;
    const db = {
        knowledge: {
            getModel: async () => ({}),
            getConnector: async () => ({ provider: 'linear', knowledgeModelId: 'model', linearWorkspaceId: 'expected' }),
            linear: {
                getCredential: async (org: string) => {
                    if (org !== 'org') throw new Error('Not found');
                    return { workspaceId: 'expected' };
                },
                saveCredential: async () => {
                    saved = true;
                },
            },
        },
    } as unknown as DBService;
    for (const fetcher of [
        async () => Response.json({ errors: [{ extensions: { code: 'AUTHENTICATION_ERROR' }, message: input.apiKey }] }, { status: 401 }),
        async () => {
            throw new Error(input.apiKey);
        },
        async () => Response.json({ data: { organization: { id: 'other', name: 'Other' } } }),
    ])
        await assert.rejects(
            saveLinearApiKey(db, { ...input, credentialId: 'credential' }, { fetch: fetcher }),
            error => error instanceof Error && !error.message.includes(input.apiKey),
        );
    await assert.rejects(
        saveLinearApiKey(db, { ...input, connectorId: 'migrated' }, { fetch: async () => Response.json({ data: { organization: { id: 'other', name: 'Other' } } }) }),
        /same Linear workspace/,
    );
    await assert.rejects(saveLinearApiKey(db, { ...input, organizationId: 'other-org', credentialId: 'credential' }), /Not found/);
    assert.equal(saved, false);
    delete process.env.DS_SECRET_KEY;
    await assert.rejects(saveLinearApiKey(db, input), /persistent/);
});

test('authentication failures carry the version actually used and transient errors do not invalidate credentials', async () => {
    configure();
    const invalidations: unknown[] = [];
    let currentVersion = 1;
    const db = {
        knowledge: {
            linear: {
                getCredential: async () => ({ version: currentVersion, status: 'active', apiKeyEncrypted: await encrypt(input.apiKey) }),
                invalidateCredential: async (...args: unknown[]) => {
                    invalidations.push(args);
                    return args[2] === currentVersion;
                },
            },
        },
    } as unknown as DBService;
    await assert.rejects(
        withLinearAccess(db, 'org', 'credential', async key => {
            assert.equal(key, input.apiKey);
            currentVersion = 2; // A replacement commits before the old request fails.
            throw new LinearApiError('Invalid key', false, undefined, true);
        }),
    );
    assert.deepEqual(invalidations, [['org', 'credential', 1]]);
    await assert.rejects(
        withLinearAccess(db, 'org', 'credential', async () => {
            throw new LinearApiError('Network error', true);
        }),
    );
    assert.equal(invalidations.length, 1);
});
