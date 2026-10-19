import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import type { DBService } from '@dory/database';
import { verifyGitHubWebhook } from '../../lib/server/github-app';
import { handleGitHubConnectorWebhook } from '../../lib/server/knowledge-connector-sync';

test('GitHub webhook signatures are verified with SHA-256', () => {
    process.env.GITHUB_APP_WEBHOOK_SECRET = 'test-secret';
    const body = JSON.stringify({ zen: 'test' });
    const signature = `sha256=${createHmac('sha256', 'test-secret').update(body).digest('hex')}`;
    assert.equal(verifyGitHubWebhook(body, signature), true);
    assert.equal(verifyGitHubWebhook(`${body}x`, signature), false);
    assert.equal(verifyGitHubWebhook(body, 'sha256=short'), false);
});

test('push events queue only connected default branches and coalesce through the repository API', async () => {
    const queued: Array<{ connectorId: string; targetSha?: string | null }> = [];
    const db = {
        knowledge: {
            findConnectorsByGitHubRepository: async () => [
                { id: 'connector-main', status: 'ready', defaultBranch: 'main' },
                { id: 'connector-disabled', status: 'disabled', defaultBranch: 'main' },
                { id: 'connector-other', status: 'ready', defaultBranch: 'develop' },
            ],
            queueConnectorSync: async (input: { connectorId: string; targetSha?: string | null }) => queued.push(input),
            claimConnectorSyncJob: async () => null,
        },
    } as unknown as DBService;
    await handleGitHubConnectorWebhook(db, 'push', {
        ref: 'refs/heads/main',
        after: 'commit-2',
        installation: { id: 10 },
        repository: { id: 20, default_branch: 'main' },
    });
    assert.deepEqual(queued, [{ connectorId: 'connector-main', targetSha: 'commit-2' }]);
});

test('installation access removal disables matching connectors', async () => {
    const disabled: unknown[] = [];
    const db = { knowledge: { disableConnectors: async (input: unknown) => disabled.push(input) } } as unknown as DBService;
    await handleGitHubConnectorWebhook(db, 'installation_repositories', {
        action: 'removed',
        installation: { id: 10 },
        repositories_removed: [{ id: 20 }, { id: 21 }],
    });
    assert.deepEqual(disabled, [{ installationId: '10', repositoryIds: ['20', '21'] }]);
});
