import assert from 'node:assert/strict';
import test from 'node:test';

import { buildElectronAuthDeepLinkUrl } from '../../app/api/electron/auth/finalize-page';

async function withDesktopProtocolEnv<T>(env: { DORY_PROTOCOL_SCHEME?: string; DORY_DISTRIBUTION?: string }, fn: () => T | Promise<T>) {
    const previousProtocol = process.env.DORY_PROTOCOL_SCHEME;
    const previousDistribution = process.env.DORY_DISTRIBUTION;

    if (env.DORY_PROTOCOL_SCHEME === undefined) {
        delete process.env.DORY_PROTOCOL_SCHEME;
    } else {
        process.env.DORY_PROTOCOL_SCHEME = env.DORY_PROTOCOL_SCHEME;
    }

    if (env.DORY_DISTRIBUTION === undefined) {
        delete process.env.DORY_DISTRIBUTION;
    } else {
        process.env.DORY_DISTRIBUTION = env.DORY_DISTRIBUTION;
    }

    try {
        return await fn();
    } finally {
        if (previousProtocol === undefined) {
            delete process.env.DORY_PROTOCOL_SCHEME;
        } else {
            process.env.DORY_PROTOCOL_SCHEME = previousProtocol;
        }

        if (previousDistribution === undefined) {
            delete process.env.DORY_DISTRIBUTION;
        } else {
            process.env.DORY_DISTRIBUTION = previousDistribution;
        }
    }
}

test('electron auth finalize deep link defaults to the stable desktop protocol', async () => {
    await withDesktopProtocolEnv({ DORY_PROTOCOL_SCHEME: undefined, DORY_DISTRIBUTION: undefined }, () => {
        const url = new URL(buildElectronAuthDeepLinkUrl({ ticket: 'ticket-1' }));

        assert.equal(url.protocol, 'dory:');
        assert.equal(url.hostname, 'auth-complete');
        assert.equal(url.searchParams.get('ticket'), 'ticket-1');
    });
});

test('electron auth finalize deep link uses the beta desktop protocol when configured', async () => {
    await withDesktopProtocolEnv({ DORY_PROTOCOL_SCHEME: undefined, DORY_DISTRIBUTION: 'beta' }, () => {
        const url = new URL(buildElectronAuthDeepLinkUrl({ ticket: 'ticket-1' }));

        assert.equal(url.protocol, 'dory-beta:');
        assert.equal(url.hostname, 'auth-complete');
        assert.equal(url.searchParams.get('ticket'), 'ticket-1');
    });
});

test('electron auth finalize deep link respects explicit desktop protocol overrides', async () => {
    await withDesktopProtocolEnv({ DORY_PROTOCOL_SCHEME: 'dory-dev', DORY_DISTRIBUTION: 'beta' }, () => {
        const url = new URL(buildElectronAuthDeepLinkUrl({ error: 'access_denied' }));

        assert.equal(url.protocol, 'dory-dev:');
        assert.equal(url.hostname, 'auth-complete');
        assert.equal(url.searchParams.get('error'), 'access_denied');
    });
});

test('electron auth finalize deep link can use a requested beta protocol', async () => {
    await withDesktopProtocolEnv({ DORY_PROTOCOL_SCHEME: undefined, DORY_DISTRIBUTION: undefined }, () => {
        const url = new URL(buildElectronAuthDeepLinkUrl({ ticket: 'ticket-1' }, { protocolScheme: 'dory-beta' }));

        assert.equal(url.protocol, 'dory-beta:');
        assert.equal(url.hostname, 'auth-complete');
        assert.equal(url.searchParams.get('ticket'), 'ticket-1');
    });
});

test('electron auth finalize deep link ignores non-Dory requested protocols', async () => {
    await withDesktopProtocolEnv({ DORY_PROTOCOL_SCHEME: undefined, DORY_DISTRIBUTION: undefined }, () => {
        const url = new URL(buildElectronAuthDeepLinkUrl({ ticket: 'ticket-1' }, { protocolScheme: 'https' }));

        assert.equal(url.protocol, 'dory:');
        assert.equal(url.hostname, 'auth-complete');
        assert.equal(url.searchParams.get('ticket'), 'ticket-1');
    });
});
