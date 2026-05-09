import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveDesktopSessionFromHeaders } from '../../lib/auth/session-resolution';

test('desktop session resolution prefers local session over cloud session', async () => {
    let localCalls = 0;
    let recoveredCalls = 0;
    let cloudCalls = 0;

    const session = await resolveDesktopSessionFromHeaders({
        headers: new Headers({
            cookie: 'better-auth.session_token=local-token',
        }),
        url: 'http://127.0.0.1:3100/',
        fallbacks: {
            async getLocalSession() {
                localCalls += 1;
                return { source: 'local' };
            },
            async getRecoveredSession() {
                recoveredCalls += 1;
                return null;
            },
            async getCloudSession() {
                cloudCalls += 1;
                return { source: 'cloud' };
            },
        },
    });

    assert.deepEqual(session, { source: 'local' });
    assert.equal(localCalls, 1);
    assert.equal(recoveredCalls, 0);
    assert.equal(cloudCalls, 0);
});

test('desktop session resolution falls back to recovery before cloud', async () => {
    let localCalls = 0;
    let recoveredCalls = 0;
    let cloudCalls = 0;

    const session = await resolveDesktopSessionFromHeaders({
        headers: new Headers({
            cookie: 'dory.desktop_session_token=payload',
        }),
        url: 'http://127.0.0.1:3100/',
        fallbacks: {
            async getLocalSession() {
                localCalls += 1;
                return null;
            },
            async getRecoveredSession() {
                recoveredCalls += 1;
                return { source: 'recovered' };
            },
            async getCloudSession() {
                cloudCalls += 1;
                return { source: 'cloud' };
            },
        },
    });

    assert.deepEqual(session, { source: 'recovered' });
    assert.equal(localCalls, 1);
    assert.equal(recoveredCalls, 1);
    assert.equal(cloudCalls, 0);
});

test('desktop session resolution uses cloud only when local recovery is unavailable', async () => {
    let localCalls = 0;
    let recoveredCalls = 0;
    let cloudCalls = 0;

    const session = await resolveDesktopSessionFromHeaders({
        headers: new Headers(),
        url: 'http://127.0.0.1:3100/',
        fallbacks: {
            async getLocalSession() {
                localCalls += 1;
                return null;
            },
            async getRecoveredSession() {
                recoveredCalls += 1;
                return null;
            },
            async getCloudSession() {
                cloudCalls += 1;
                return { source: 'cloud' };
            },
        },
    });

    assert.deepEqual(session, { source: 'cloud' });
    assert.equal(localCalls, 1);
    assert.equal(recoveredCalls, 1);
    assert.equal(cloudCalls, 1);
});
