import assert from 'node:assert/strict';
import test from 'node:test';
import { isBillingAvailableRuntimeValue, normalizeRuntime } from '../../lib/runtime/runtime';

test('normalizeRuntime resolves known runtime values', () => {
    assert.equal(normalizeRuntime('desktop'), 'desktop');
    assert.equal(normalizeRuntime('web'), 'web');
    assert.equal(normalizeRuntime('docker'), 'docker');
});

test('isBillingAvailableRuntimeValue only enables web and docker', () => {
    assert.equal(isBillingAvailableRuntimeValue('desktop'), false);
    assert.equal(isBillingAvailableRuntimeValue('web'), true);
    assert.equal(isBillingAvailableRuntimeValue('docker'), true);
    assert.equal(isBillingAvailableRuntimeValue(null), false);
});

test('normalizeRuntime rejects unsupported values', () => {
    assert.equal(normalizeRuntime('mobile'), null);
    assert.equal(normalizeRuntime(''), null);
});
