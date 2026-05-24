import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCloudApiBaseUrl } from '../../lib/cloud/url';

test('cloud api url uses explicit api url first', () => {
    assert.equal(
        resolveCloudApiBaseUrl({
            env: {
                DORY_CLOUD_API_URL: 'https://cloud.example.com/api/',
            },
            runtime: 'desktop',
        }),
        'https://cloud.example.com/api',
    );
});

test('cloud api url preserves web runtime without implicit cloud default', () => {
    assert.equal(
        resolveCloudApiBaseUrl({
            env: {},
            runtime: 'web',
        }),
        null,
    );
});

test('cloud api url defaults desktop runtime to Dory cloud', () => {
    assert.equal(
        resolveCloudApiBaseUrl({
            env: {},
            runtime: 'desktop',
        }),
        'https://app.getdory.dev/api',
    );
});
