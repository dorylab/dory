import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readConfig, resolveCredential, saveCredential } from './config.js';

test('stores credentials with user-only file permissions', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dory-mcp-config-'));
    const configPath = path.join(dir, 'mcp.json');

    try {
        await saveCredential(
            'https://dory.example.com',
            {
                endpoint: 'https://dory.example.com/api/mcp',
                token: 'dory_mcp_token',
                tokenPrefix: 'dory_mcp_token',
                createdAt: '2026-01-01T00:00:00.000Z',
            },
            configPath,
        );

        const config = await readConfig(configPath);
        assert.equal(config.credentials['https://dory.example.com']?.token, 'dory_mcp_token');
        assert.equal((await stat(configPath)).mode & 0o777, 0o600);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('resolves DORY_MCP_TOKEN as an advanced override without reading config credentials', async () => {
    const credential = await resolveCredential('https://dory.example.com', {
        DORY_MCP_TOKEN: 'dory_mcp_env_token',
    } as NodeJS.ProcessEnv);

    assert.equal(credential?.origin, 'https://dory.example.com');
    assert.equal(credential?.endpoint, 'https://dory.example.com/api/mcp');
    assert.equal(credential?.token, 'dory_mcp_env_token');
});
