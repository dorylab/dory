import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { resolveDoryStorageProfile } from '../storage';

test('resolves explicit desktop storage profile', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dory-desktop-'));
    try {
        const profile = resolveDoryStorageProfile({ profile: 'desktop', userDataDir: dir });
        assert.equal(profile.profile, 'desktop');
        assert.equal(profile.dbType, 'pglite');
        assert.equal(profile.userDataDir, dir);
        assert.equal(profile.pglitePath, path.join(dir, 'data', 'database'));
        assert.equal(profile.secretsPath, path.join(dir, 'desktop-secrets.json'));
        assert.match(profile.dsSecretKey, /^[A-Za-z0-9+/]+={0,2}$/);
        const secrets = JSON.parse(readFileSync(profile.secretsPath, 'utf8'));
        assert.equal(typeof secrets.DS_SECRET_KEY, 'string');
        assert.equal(typeof secrets.BETTER_AUTH_SECRET, 'string');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('databaseUrl switches app storage to postgres', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dory-headless-'));
    try {
        const profile = resolveDoryStorageProfile({ profile: 'headless', userDataDir: dir, databaseUrl: 'postgresql://postgres:postgres@localhost/postgres' });
        assert.equal(profile.dbType, 'postgres');
        assert.equal(profile.databaseUrl, 'postgresql://postgres:postgres@localhost/postgres');
        assert.equal(profile.pglitePath, undefined);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
