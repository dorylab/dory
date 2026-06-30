import assert from 'node:assert/strict';
import test from 'node:test';

import { parseDoryDeepLink } from '../../main/deep-link.js';

test('parseDoryDeepLink parses workspace open links', () => {
  assert.deepEqual(parseDoryDeepLink('dory://open?path=%2Forg%2Fagent-runs%2Fwork-1%2Fworkspace%2Fconn-1%3FtabId%3Dtab-1', 'dory'), {
    type: 'open',
    path: '/org/agent-runs/work-1/workspace/conn-1?tabId=tab-1',
  });
});

test('parseDoryDeepLink preserves auth deep links', () => {
  assert.deepEqual(parseDoryDeepLink('dory://auth-complete?code=abc', 'dory'), {
    type: 'auth',
    url: 'dory://auth-complete?code=abc',
  });
});

test('parseDoryDeepLink rejects unsafe workspace paths', () => {
  assert.equal(parseDoryDeepLink('dory://open?path=https%3A%2F%2Fapp.getdory.dev%2Forg', 'dory'), null);
  assert.equal(parseDoryDeepLink('dory://open?path=%2F%2Fevil.example.com%2Forg', 'dory'), null);
  assert.equal(parseDoryDeepLink('dory://open?path=%5C%5Cevil.example.com%5Corg', 'dory'), null);
  assert.equal(parseDoryDeepLink('dory-beta://open?path=%2Forg', 'dory'), null);
});
