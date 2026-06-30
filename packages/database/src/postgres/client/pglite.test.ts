import assert from 'node:assert/strict';
import test from 'node:test';
import { resetPgliteClient } from './pglite';

const globalForPglite = globalThis as typeof globalThis & {
    __pgliteDbPromise?: Promise<unknown>;
    __pgliteClient?: { close?: () => Promise<void> };
};

test('resetPgliteClient clears cached client even when close fails', async () => {
    const closeError = new Error('close failed');
    globalForPglite.__pgliteClient = {
        close: async () => {
            throw closeError;
        },
    };
    globalForPglite.__pgliteDbPromise = Promise.resolve({});

    await assert.rejects(resetPgliteClient(), closeError);
    assert.equal(globalForPglite.__pgliteClient, undefined);
    assert.equal(globalForPglite.__pgliteDbPromise, undefined);
});
