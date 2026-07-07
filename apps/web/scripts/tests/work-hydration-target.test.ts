import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveWorkHydrationTarget } from '@/app/(app)/[organization]/[connectionId]/sql-console/work-hydration-target';
import type { UITabPayload } from '@dory/shared/types/tabs';

const tabs = [
    {
        tabId: 'tab-1',
        tabType: 'sql',
        tabName: 'First',
        content: 'select 1',
        userId: 'user-1',
        connectionId: 'conn-1',
    },
    {
        tabId: 'tab-2',
        tabType: 'sql',
        tabName: 'Second',
        content: 'select 2',
        userId: 'user-1',
        connectionId: 'conn-1',
    },
] as UITabPayload[];

test('work hydration maps every workspace tab to its latest persisted result session', () => {
    const target = resolveWorkHydrationTarget({
        tabs,
        sessions: [
            {
                session: {
                    sessionId: 'session-1-old',
                    tabId: 'tab-1',
                    startedAt: '2026-06-01T00:00:00.000Z',
                },
            },
            {
                session: {
                    sessionId: 'session-2',
                    tabId: 'tab-2',
                    startedAt: '2026-06-01T00:01:00.000Z',
                },
            },
            {
                session: {
                    sessionId: 'session-1-new',
                    tabId: 'tab-1',
                    startedAt: '2026-06-01T00:02:00.000Z',
                },
            },
        ],
    });

    assert.deepEqual(target.sessionIdByTab, {
        'tab-1': 'session-1-new',
        'tab-2': 'session-2',
    });
    assert.equal(target.targetTabId, 'tab-1');
    assert.equal(target.targetSessionId, 'session-1-new');
});

test('work hydration respects requested tab and session from Open workspace URL', () => {
    const target = resolveWorkHydrationTarget({
        tabs,
        requestedTabId: 'tab-2',
        requestedSessionId: 'session-2',
        sessions: [
            {
                session: {
                    sessionId: 'session-1',
                    tabId: 'tab-1',
                    startedAt: '2026-06-01T00:02:00.000Z',
                },
            },
            {
                session: {
                    sessionId: 'session-2',
                    tabId: 'tab-2',
                    startedAt: '2026-06-01T00:01:00.000Z',
                },
            },
        ],
    });

    assert.equal(target.targetTabId, 'tab-2');
    assert.equal(target.targetSessionId, 'session-2');
    assert.deepEqual(target.sessionIdByTab, {
        'tab-1': 'session-1',
        'tab-2': 'session-2',
    });
});

test('work hydration can resolve targets from snapshot tabs before UI tabs load', () => {
    const target = resolveWorkHydrationTarget({
        tabs,
        sessions: [
            {
                session: {
                    sessionId: 'session-1',
                    tabId: 'tab-1',
                    startedAt: '2026-06-01T00:00:00.000Z',
                },
            },
            {
                session: {
                    sessionId: 'session-2',
                    tabId: 'tab-2',
                    startedAt: '2026-06-01T00:01:00.000Z',
                },
            },
        ],
    });

    assert.deepEqual(target.sessionIdByTab, {
        'tab-1': 'session-1',
        'tab-2': 'session-2',
    });
    assert.equal(target.targetTabId, 'tab-2');
    assert.equal(target.targetSessionId, 'session-2');
});

test('work hydration maps session ids even when no tabs are loaded yet', () => {
    const target = resolveWorkHydrationTarget({
        tabs: [],
        requestedTabId: 'tab-2',
        sessions: [
            {
                session: {
                    sessionId: 'session-1',
                    tabId: 'tab-1',
                    startedAt: '2026-06-01T00:00:00.000Z',
                },
            },
            {
                session: {
                    sessionId: 'session-2',
                    tabId: 'tab-2',
                    startedAt: '2026-06-01T00:01:00.000Z',
                },
            },
        ],
    });

    assert.deepEqual(target.sessionIdByTab, {
        'tab-1': 'session-1',
        'tab-2': 'session-2',
    });
    assert.equal(target.targetTabId, 'tab-2');
    assert.equal(target.targetSessionId, 'session-2');
});
