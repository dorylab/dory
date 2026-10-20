import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ensureDesktopSecrets } from '../../main/desktop-secrets.js';

test('Desktop encryption key persists across restart and a failed write never returns an ephemeral key', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dory-desktop-secret-'));
    try {
        const first = ensureDesktopSecrets(dir, () => {});
        assert.equal(Buffer.from(first.dsSecretKey, 'base64').length, 32);
        const saved = fs.readFileSync(path.join(dir, 'desktop-secrets.json'), 'utf8');
        assert.equal(JSON.parse(saved).DS_SECRET_KEY, first.dsSecretKey);
        assert.deepEqual(
            ensureDesktopSecrets(dir, () => {}),
            first,
        );
        assert.equal(fs.readFileSync(path.join(dir, 'desktop-secrets.json'), 'utf8'), saved);
        if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(dir, 'desktop-secrets.json')).mode & 0o777, 0o600);
        assert.throws(() => ensureDesktopSecrets(path.join(dir, 'missing'), () => {}), /could not be persisted/);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
