import assert from 'node:assert/strict';
import test from 'node:test';
import { getLicenseForServer, isBillingAvailableRuntimeValue, normalizeRuntime } from '@dory/shared/runtime';

test('normalizeRuntime resolves known runtime values', () => {
    assert.equal(normalizeRuntime('desktop'), 'desktop');
    assert.equal(normalizeRuntime('web'), 'web');
    assert.equal(normalizeRuntime('docker'), 'docker');
});

test('isBillingAvailableRuntimeValue only enables web', () => {
    assert.equal(isBillingAvailableRuntimeValue('desktop'), false);
    assert.equal(isBillingAvailableRuntimeValue('web'), true);
    assert.equal(isBillingAvailableRuntimeValue('docker'), false);
    assert.equal(isBillingAvailableRuntimeValue(null), false);
});

test('normalizeRuntime rejects unsupported values', () => {
    assert.equal(normalizeRuntime('mobile'), null);
    assert.equal(normalizeRuntime(''), null);
});

test('docker runtime always uses OSS license', () => {
    const previousEnv = {
        DORY_RUNTIME: process.env.DORY_RUNTIME,
        NEXT_PUBLIC_DORY_RUNTIME: process.env.NEXT_PUBLIC_DORY_RUNTIME,
        DORY_LICENSE: process.env.DORY_LICENSE,
    };

    try {
        process.env.DORY_RUNTIME = 'docker';
        delete process.env.NEXT_PUBLIC_DORY_RUNTIME;
        process.env.DORY_LICENSE = 'enterprise';
        assert.equal(getLicenseForServer(), 'oss');

        process.env.DORY_RUNTIME = 'web';
        assert.equal(getLicenseForServer(), 'enterprise');
    } finally {
        for (const [key, value] of Object.entries(previousEnv)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    }
});
