import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import test from 'node:test';

import { waitForInputClose } from '../mcp/stdio-lifecycle';

test('stdio lifecycle resolves when stdin closes', async () => {
    const stdin = new PassThrough();
    let resolved = false;

    const running = waitForInputClose(stdin).then(() => {
        resolved = true;
    });

    await sleep(10);
    assert.equal(resolved, false);

    stdin.resume();
    stdin.end();
    await running;
    assert.equal(resolved, true);
});
