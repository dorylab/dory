import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAgentRunTimeline, getAgentRunStats, getAgentRunStatusLabel, getAgentRunSummary } from '@/lib/agent-runs/summary';

test('Agent Run status labels map internal storage to product labels', () => {
    assert.equal(getAgentRunStatusLabel('active'), 'Active');
    assert.equal(getAgentRunStatusLabel('completed'), 'Completed');
    assert.equal(getAgentRunStatusLabel('error'), 'Failed');
    assert.equal(getAgentRunStatusLabel('archived'), 'Archived');
});

test('Agent Run stats derive counts from snapshot data', () => {
    const stats = getAgentRunStats(
        {
            work: {
                workId: 'work-1',
                status: 'active',
                connectionId: 'conn-1',
                lastActiveAt: '2026-06-01T00:00:00.000Z',
            },
            tabs: [{ tabId: 'tab-1' }, { tabId: 'tab-2' }],
            sessions: [{ session: { sessionId: 'session-1' } }, { session: { sessionId: 'session-2' } }],
        },
        'play',
    );

    assert.equal(stats.dataSource, 'play');
    assert.equal(stats.tabCount, 2);
    assert.equal(stats.sqlExecutionCount, 2);
    assert.equal(stats.statusLabel, 'Active');
});

test('Agent Run summary accepts only persisted agent summary metadata', () => {
    assert.equal(getAgentRunSummary(null), null);
    assert.equal(getAgentRunSummary({ agentRunSummary: { summaryBullets: [] } }), null);
    assert.deepEqual(getAgentRunSummary({ agentRunSummary: { summaryTitle: 'HN analysis', summaryBullets: ['Queried stories'] } }), {
        summaryTitle: 'HN analysis',
        summaryBullets: ['Queried stories'],
        updatedAt: null,
    });
});

test('Agent Run timeline renders SQL activity with tab, rows, duration, and raw details', () => {
    const timeline = buildAgentRunTimeline(
        {
            work: {
                workId: 'work-1',
                status: 'completed',
            },
            tabs: [{ tabId: 'tab-1', tabName: 'HN hot posts - overview' }],
            sessions: [
                {
                    session: {
                        sessionId: 'session-1',
                        tabId: 'tab-1',
                        sqlText: 'select * from stories',
                        durationMs: 1400,
                    },
                    queryResultSets: [{ rowCount: 20, durationMs: 1400, status: 'success' }],
                },
            ],
        },
        [
            {
                eventId: 'event-1',
                toolName: 'dory_run_readonly_sql',
                status: 'success',
                outputSummary: {
                    sessionId: 'session-1',
                    tabId: 'tab-1',
                    rowCount: 20,
                },
                inputSummary: {
                    sqlLength: 21,
                },
                durationMs: 1400,
                createdAt: '2026-06-01T00:00:00.000Z',
            },
        ],
    );

    assert.equal(timeline.length, 1);
    assert.equal(timeline[0]?.title, 'Ran SQL in "HN hot posts - overview"');
    assert.deepEqual(timeline[0]?.meta, ['20 rows', '1.4s', 'success', 'result not saved']);
    assert.equal(timeline[0]?.sessionId, 'session-1');
    assert.equal(timeline[0]?.tabId, 'tab-1');
    assert.equal(timeline[0]?.sqlLength, 21);
});
