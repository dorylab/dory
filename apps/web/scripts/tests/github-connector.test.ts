import assert from 'node:assert/strict';
import test from 'node:test';

import type { KnowledgeConnector } from '@dory/database/postgres/schemas';
import { listGitHubDirectories, listGitHubRepositories, readGitHubConnectorSnapshot } from '../../lib/server/github-connector';

const connector: KnowledgeConnector = {
    id: 'connector-1',
    organizationId: 'org-1',
    knowledgeModelId: 'model-1',
    provider: 'github',
    installationId: '10',
    repositoryId: '20',
    repositoryFullName: 'dorylab/docs',
    defaultBranch: 'main',
    rootPath: 'docs',
    status: 'pending',
    lastCommitSha: null,
    lastSyncedAt: null,
    lastError: null,
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
};

function mockClient() {
    const requests: Array<{ url: string; authorization: string | null }> = [];
    const mockFetch: typeof fetch = async (input, init) => {
        const url = String(input);
        requests.push({ url, authorization: new Headers(init?.headers).get('authorization') });
        if (url.includes('/installation/repositories')) {
            return Response.json({ repositories: [{ id: 20, full_name: 'dorylab/docs', default_branch: 'main', private: true }] });
        }
        if (url.includes('/git/trees/')) {
            return Response.json({
                sha: 'commit-sha',
                truncated: false,
                tree: [
                    { path: 'docs', type: 'tree', mode: '040000', sha: 'tree-docs' },
                    { path: 'docs/guides', type: 'tree', mode: '040000', sha: 'tree-guides' },
                    { path: 'docs/readme.md', type: 'blob', mode: '100644', sha: 'blob-md', size: 7 },
                    { path: 'docs/guides/model.yaml', type: 'blob', mode: '100644', sha: 'blob-yaml', size: 10 },
                    { path: 'docs/image.png', type: 'blob', mode: '100644', sha: 'blob-png', size: 10 },
                    { path: 'outside.txt', type: 'blob', mode: '100644', sha: 'blob-outside', size: 7 },
                ],
            });
        }
        if (url.endsWith('/blob-md')) return Response.json({ encoding: 'base64', content: Buffer.from('# Dory\n').toString('base64') });
        if (url.endsWith('/blob-yaml')) return Response.json({ encoding: 'base64', content: Buffer.from('name: Dory\n').toString('base64') });
        throw new Error(`Unexpected request: ${url}`);
    };
    return { requests, options: { fetch: mockFetch, tokenProvider: async () => ({ token: 'installation-token' }) } };
}

test('GitHub provider uses an installation token and returns accessible repositories', async () => {
    const mock = mockClient();
    const repositories = await listGitHubRepositories('10', mock.options);
    assert.deepEqual(repositories, [{ id: '20', fullName: 'dorylab/docs', defaultBranch: 'main', private: true }]);
    assert.ok(mock.requests.every(request => request.authorization === 'Bearer installation-token'));
});

test('GitHub provider browses folders and recursively reads only supported documents under the selected root', async () => {
    const mock = mockClient();
    const directories = await listGitHubDirectories('10', 'dorylab/docs', 'main', mock.options);
    assert.deepEqual(directories, ['', 'docs', 'docs/guides']);
    const snapshot = await readGitHubConnectorSnapshot(connector, mock.options);
    assert.equal(snapshot.commitSha, 'commit-sha');
    assert.deepEqual(
        snapshot.files.map(file => [file.path, file.sha, file.contentText]),
        [
            ['docs/readme.md', 'blob-md', '# Dory\n'],
            ['docs/guides/model.yaml', 'blob-yaml', 'name: Dory\n'],
        ],
    );
    assert.equal(
        mock.requests.some(request => request.url.includes('blob-png') || request.url.includes('blob-outside')),
        false,
    );
});
