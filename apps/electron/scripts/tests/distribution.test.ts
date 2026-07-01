import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveDistribution, resolveElectronAppId, resolveProtocolScheme } from '../../main/distribution.js';

test('resolveDistribution uses explicit beta env first', () => {
    assert.equal(resolveDistribution({ env: { DORY_DISTRIBUTION: 'beta' }, packageMetadata: null, appName: 'Dory' }), 'beta');
});

test('resolveDistribution uses packaged metadata when env is absent', () => {
    assert.equal(resolveDistribution({ env: {}, packageMetadata: { doryDistribution: 'beta' }, appName: 'dory' }), 'beta');
});

test('resolveDistribution falls back to packaged productName', () => {
    assert.equal(resolveDistribution({ env: {}, packageMetadata: { productName: 'Dory Beta' }, appName: 'dory' }), 'beta');
});

test('resolveDistribution falls back to Electron app name', () => {
    assert.equal(resolveDistribution({ env: {}, packageMetadata: {}, appName: 'Dory Beta' }), 'beta');
});

test('resolveDistribution treats invalid or missing values as stable', () => {
    assert.equal(resolveDistribution({ env: {}, packageMetadata: {}, appName: 'Dory' }), 'stable');
    assert.equal(resolveDistribution({ env: { DORY_DISTRIBUTION: 'canary' }, packageMetadata: { doryDistribution: 'beta' }, appName: 'Dory Beta' }), 'stable');
    assert.equal(resolveDistribution({ env: {}, packageMetadata: { doryDistribution: 'canary', productName: 'Dory' }, appName: 'dory' }), 'stable');
});

test('resolveDistribution lets env override packaged metadata', () => {
    assert.equal(resolveDistribution({ env: { DORY_DISTRIBUTION: 'stable' }, packageMetadata: { doryDistribution: 'beta' }, appName: 'Dory Beta' }), 'stable');
});

test('resolveElectronAppId uses env, metadata, then distribution defaults', () => {
    assert.equal(resolveElectronAppId({ env: { DORY_ELECTRON_APP_ID: 'custom.app' }, packageMetadata: { doryElectronAppId: 'com.dory.app.beta' }, distribution: 'beta' }), 'custom.app');
    assert.equal(resolveElectronAppId({ env: {}, packageMetadata: { doryElectronAppId: 'com.dory.app.beta' }, distribution: 'stable' }), 'com.dory.app.beta');
    assert.equal(resolveElectronAppId({ env: {}, packageMetadata: {}, distribution: 'beta' }), 'com.dory.app.beta');
    assert.equal(resolveElectronAppId({ env: {}, packageMetadata: {}, distribution: 'stable' }), 'com.dory.app');
});

test('resolveProtocolScheme uses env, metadata, then distribution defaults', () => {
    assert.equal(resolveProtocolScheme({ env: { DORY_PROTOCOL_SCHEME: 'dory-dev' }, packageMetadata: { doryProtocolScheme: 'dory-beta' }, distribution: 'beta' }), 'dory-dev');
    assert.equal(resolveProtocolScheme({ env: {}, packageMetadata: { doryProtocolScheme: 'dory-beta' }, distribution: 'stable' }), 'dory-beta');
    assert.equal(resolveProtocolScheme({ env: {}, packageMetadata: {}, distribution: 'beta' }), 'dory-beta');
    assert.equal(resolveProtocolScheme({ env: {}, packageMetadata: {}, distribution: 'stable' }), 'dory');
});
