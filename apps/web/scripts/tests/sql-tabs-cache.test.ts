import assert from 'node:assert/strict';
import test from 'node:test';

import type { TabPayload, UITabPayload } from '@dory/shared/types/tabs';

import { parseSqlTabsCache, serializeSqlTabsCache } from '../../app/(app)/[organization]/[connectionId]/sql-console/components/tabs/tab-cache';
import { getTabsStorageKey } from '../../app/(app)/[organization]/[connectionId]/sql-console/workspace-scope';

test('round-trips the SQL needed for an immediate refresh render without cached result rows', () => {
    const tab: UITabPayload = {
        tabId: 'tab-1',
        tabType: 'sql',
        tabName: 'Cell Towers query',
        content: 'SELECT * FROM cell_towers LIMIT 1000000',
        status: 'success',
        userId: 'user-1',
        connectionId: 'connection-1',
        orderIndex: 0,
        result: {
            fields: [],
            results: [{ rowData: { shouldNotBeCached: true } }],
            rowCount: 1,
        },
    };

    const serialized = serializeSqlTabsCache([tab], cachedTab => {
        const { result: _result, ...persistedTab } = cachedTab;
        return persistedTab as TabPayload;
    });
    const restored = parseSqlTabsCache(serialized);

    assert.equal(restored.length, 1);
    assert.equal(restored[0]?.tabType, 'sql');
    assert.equal(restored[0]?.content, tab.content);
    assert.equal(restored[0]?.tabName, tab.tabName);
    assert.equal(restored[0]?.result, undefined);
    assert.equal(serialized.includes('shouldNotBeCached'), false);
});

test('keeps cached tabs isolated by connection and agent workspace', () => {
    assert.equal(getTabsStorageKey({ workspaceMode: 'human', connectionId: 'connection-1' }), 'sqlconsole:tabs:connection-1');
    assert.equal(getTabsStorageKey({ workspaceMode: 'human', connectionId: 'connection-2' }), 'sqlconsole:tabs:connection-2');
    assert.equal(getTabsStorageKey({ workspaceMode: 'agent', connectionId: 'connection-1', workId: 'work-1' }), 'sqlconsole:tabs:connection-1:work:work-1');
});

test('ignores malformed or unsupported cache payloads', () => {
    assert.deepEqual(parseSqlTabsCache(null), []);
    assert.deepEqual(parseSqlTabsCache('{not-json'), []);
    assert.deepEqual(parseSqlTabsCache(JSON.stringify({ version: 2, tabs: [] })), []);
    assert.deepEqual(parseSqlTabsCache(JSON.stringify({ version: 1, tabs: [{ tabType: 'sql' }] })), []);
});
