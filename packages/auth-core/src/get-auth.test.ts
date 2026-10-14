import assert from 'node:assert/strict';
import test from 'node:test';

import { createCachedAsyncFactory } from './get-auth';

test('concurrent callers share initialization and reuse the successful result', async () => {
    let calls = 0;
    const auth = { ready: true };
    const getAuth = createCachedAsyncFactory(async () => {
        calls += 1;
        return auth;
    });

    const results = await Promise.all([getAuth(), getAuth(), getAuth()]);
    assert.deepEqual(results, [auth, auth, auth]);
    assert.equal(await getAuth(), auth);
    assert.equal(calls, 1);
});

test('a failed initialization is shared, then the next request can recover', async () => {
    let calls = 0;
    const failure = new Error('database temporarily unavailable');
    const getAuth = createCachedAsyncFactory(async () => {
        calls += 1;
        if (calls === 1) throw failure;
        return { ready: true };
    });

    const results = await Promise.allSettled([getAuth(), getAuth()]);
    assert.equal(calls, 1);
    for (const result of results) {
        assert.equal(result.status, 'rejected');
        if (result.status === 'rejected') assert.equal(result.reason, failure);
    }
    assert.deepEqual(await getAuth(), { ready: true });
    assert.equal(calls, 2);
});

test('a synchronous factory failure also allows retry', async () => {
    let calls = 0;
    const getAuth = createCachedAsyncFactory(() => {
        calls += 1;
        if (calls === 1) throw new Error('initialization failed');
        return Promise.resolve('ready');
    });

    await assert.rejects(getAuth(), /initialization failed/);
    assert.equal(await getAuth(), 'ready');
});
