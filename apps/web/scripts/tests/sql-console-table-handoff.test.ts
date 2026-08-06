import assert from 'node:assert/strict';
import test from 'node:test';

import { consumeSqlConsoleTableHandoff, writeSqlConsoleTableHandoff } from '@/lib/client/sql-console-handoff';

function installSessionStorage() {
    const values = new Map<string, string>();
    const storage: Storage = {
        get length() {
            return values.size;
        },
        clear: () => values.clear(),
        getItem: key => values.get(key) ?? null,
        key: index => [...values.keys()][index] ?? null,
        removeItem: key => void values.delete(key),
        setItem: (key, value) => void values.set(key, value),
    };
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage });
}

test.beforeEach(() => installSessionStorage());

test('quick-query handoff is connection-scoped and consumed exactly once', () => {
    writeSqlConsoleTableHandoff({
        connectionId: 'connection-1',
        kind: 'quick-query',
        target: {
            database: 'main',
            schema: 'public',
            tableName: 'public.orders',
            tableLabel: 'orders',
            unqualifiedTableName: 'orders',
        },
    });

    const handoff = consumeSqlConsoleTableHandoff('connection-1');
    assert.equal(handoff?.kind, 'quick-query');
    assert.equal(handoff?.connectionId, 'connection-1');
    assert.equal(handoff?.kind === 'quick-query' ? handoff.target.tableName : null, 'public.orders');
    assert.equal(consumeSqlConsoleTableHandoff('connection-1'), null);
});

test('handoff for another connection is discarded instead of replayed later', () => {
    writeSqlConsoleTableHandoff({ connectionId: 'connection-1', kind: 'new-query' });

    assert.equal(consumeSqlConsoleTableHandoff('connection-2'), null);
    assert.equal(consumeSqlConsoleTableHandoff('connection-1'), null);
});
