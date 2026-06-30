import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
    DORY_LOCAL_RUNTIME_LOCK_FILE,
    DORY_LOCAL_RUNTIME_PROTOCOL_VERSION,
    DORY_LOCAL_RUNTIME_STATE_FILE,
    probeDoryLocalRuntime,
    readDoryLocalRuntimeState,
    resolveDoryLocalRuntimePaths,
    type DoryLocalRuntimeState,
} from '../local-runtime';

test('local runtime paths live under the selected user data dir', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dory-runtime-paths-'));
    try {
        const paths = resolveDoryLocalRuntimePaths({ profile: 'headless', userDataDir: dir });
        assert.equal(paths.statePath, path.join(dir, DORY_LOCAL_RUNTIME_STATE_FILE));
        assert.equal(paths.lockPath, path.join(dir, DORY_LOCAL_RUNTIME_LOCK_FILE));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('reads valid local runtime state and rejects unreachable runtime probe', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dory-runtime-state-'));
    try {
        const state: DoryLocalRuntimeState = {
            version: 1,
            protocolVersion: DORY_LOCAL_RUNTIME_PROTOCOL_VERSION,
            pid: 123,
            baseUrl: 'http://127.0.0.1:9',
            secret: 'secret',
            profile: 'headless',
            dbType: 'pglite',
            userDataDir: dir,
            pglitePath: path.join(dir, 'data', 'database'),
            startedAt: new Date(0).toISOString(),
        };
        writeFileSync(path.join(dir, DORY_LOCAL_RUNTIME_STATE_FILE), JSON.stringify(state));

        assert.deepEqual(await readDoryLocalRuntimeState({ profile: 'headless', userDataDir: dir }), state);
        assert.equal(await probeDoryLocalRuntime(state), false);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
