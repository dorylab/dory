import assert from 'node:assert/strict';
import test from 'node:test';

import { consolidateAgentWorkspaceSessions, resolveWorkHydrationTarget } from '@/app/(app)/[organization]/[connectionId]/sql-console/work-hydration-target';
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

test('Agent Workspace combines separate executions in one tab into result tabs', () => {
    const sessions = consolidateAgentWorkspaceSessions('work-1', [
        {
            session: {
                sessionId: 'session-1',
                tabId: 'tab-1',
                status: 'success',
                startedAt: '2026-06-01T00:00:00.000Z',
            },
            queryResultSets: [{ sessionId: 'session-1', setIndex: 0, resultSetId: 'result-1' }],
            results: [[{ value: 1 }]],
        },
        {
            session: {
                sessionId: 'session-2',
                tabId: 'tab-1',
                status: 'success',
                startedAt: '2026-06-01T00:01:00.000Z',
            },
            queryResultSets: [
                { sessionId: 'session-2', setIndex: 0, resultSetId: 'result-2' },
                { sessionId: 'session-2', setIndex: 1, resultSetId: 'result-3' },
            ],
            results: [[{ value: 2 }], [{ value: 3 }]],
        },
    ]);

    const virtualSession = sessions.at(-1)!;
    assert.equal(virtualSession.session.sessionId, 'agent-workspace:work-1:tab-1');
    assert.equal((virtualSession.session as { resultSetCount?: number }).resultSetCount, 3);
    assert.deepEqual(
        virtualSession.queryResultSets.map(resultSet => [resultSet.sessionId, resultSet.setIndex, resultSet.resultSetId]),
        [
            ['agent-workspace:work-1:tab-1', 0, 'result-1'],
            ['agent-workspace:work-1:tab-1', 1, 'result-2'],
            ['agent-workspace:work-1:tab-1', 2, 'result-3'],
        ],
    );
    assert.deepEqual(virtualSession.results, [[{ value: 1 }], [{ value: 2 }], [{ value: 3 }]]);

    const target = resolveWorkHydrationTarget({
        tabs: [tabs[0]!],
        sessions,
        requestedTabId: 'tab-1',
    });
    assert.equal(target.targetSessionId, 'agent-workspace:work-1:tab-1');
});

test('Agent Workspace assigns unbound historical sessions to its only SQL tab', () => {
    const sessions = consolidateAgentWorkspaceSessions(
        'work-1',
        [
            {
                session: {
                    sessionId: 'session-1',
                    tabId: '',
                    status: 'success',
                    startedAt: '2026-06-01T00:00:00.000Z',
                },
                queryResultSets: [{ sessionId: 'session-1', setIndex: 0, resultSetId: 'result-1' }],
                results: [[{ value: 1 }]],
            },
            {
                session: {
                    sessionId: 'session-2',
                    tabId: 'tab-1',
                    status: 'success',
                    startedAt: '2026-06-01T00:01:00.000Z',
                },
                queryResultSets: [{ sessionId: 'session-2', setIndex: 0, resultSetId: 'result-2' }],
                results: [[{ value: 2 }]],
            },
        ],
        'tab-1',
    );

    const virtualSession = sessions.at(-1)!;
    assert.equal(virtualSession.session.tabId, 'tab-1');
    assert.deepEqual(
        virtualSession.queryResultSets.map(resultSet => resultSet.resultSetId),
        ['result-1', 'result-2'],
    );
});
