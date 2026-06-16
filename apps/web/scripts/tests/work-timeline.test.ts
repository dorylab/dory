import assert from 'node:assert/strict';
import test from 'node:test';

import { buildWorkRunTimelines, buildWorkTimelineEvents } from '@/lib/work/timeline';

const baseEvent = {
    workId: 'work-1',
    organizationId: 'org-1',
    type: 'message',
    content: null,
    payload: null,
};

const baseSnapshot = {
    organizationId: 'org-1',
    workId: 'work-1',
    investigationId: 'analysis-1',
    workspaceId: 'tab-1',
    previousAgentStepId: null,
    intent: 'continue_analysis' as const,
    humanEdits: {
        sql: 'select 1;',
        resultPreview: null,
        chartConfig: null,
        selectedRows: null,
        userNote: null,
        changeSummary: {
            sqlEdited: true,
        },
    },
    createdByUserId: 'user-1',
};

test('work timeline merges matched workspace snapshots into user run events', () => {
    const timeline = buildWorkTimelineEvents({
        runEvents: [
            {
                ...baseEvent,
                id: 'event-1',
                runId: 'run-1',
                role: 'agent',
                createdAt: '2026-06-12T10:00:00.000Z',
            },
            {
                ...baseEvent,
                id: 'event-2',
                runId: 'run-2',
                role: 'user',
                payload: {
                    workspaceSnapshotId: 'snapshot-1',
                    investigationId: 'analysis-1',
                },
                createdAt: '2026-06-12T11:00:01.000Z',
            },
            {
                ...baseEvent,
                id: 'event-3',
                runId: 'run-2',
                role: 'agent',
                createdAt: '2026-06-12T11:00:02.000Z',
            },
        ],
        workspaceSnapshots: [
            {
                ...baseSnapshot,
                id: 'snapshot-1',
                createdAt: '2026-06-12T11:00:00.000Z',
            },
            {
                ...baseSnapshot,
                id: 'snapshot-2',
                createdAt: '2026-06-12T10:30:00.000Z',
            },
        ],
    });

    assert.deepEqual(
        timeline.map(event => event.id),
        ['run-event:event-1', 'workspace-snapshot:snapshot-2', 'run-event:event-2', 'run-event:event-3'],
    );
    assert.equal(timeline[2]?.runEvent?.id, 'event-2');
    assert.equal(timeline[2]?.snapshot?.id, 'snapshot-1');
    assert.equal(timeline.filter(event => event.snapshot?.id === 'snapshot-1').length, 1);
});

test('work run timelines keep events grouped by run', () => {
    const { runTimelines } = buildWorkRunTimelines({
        runs: [{ id: 'run-2' }, { id: 'run-1' }],
        runEvents: [
            {
                ...baseEvent,
                id: 'event-1',
                runId: 'run-1',
                role: 'user',
                createdAt: '2026-06-12T10:00:00.000Z',
            },
            {
                ...baseEvent,
                id: 'event-2',
                runId: 'run-2',
                role: 'user',
                createdAt: '2026-06-12T11:00:00.000Z',
            },
            {
                ...baseEvent,
                id: 'event-3',
                runId: 'run-1',
                role: 'agent',
                createdAt: '2026-06-12T10:00:01.000Z',
            },
        ],
        workspaceSnapshots: [],
    });

    assert.deepEqual(
        runTimelines.map(item => item.run.id),
        ['run-2', 'run-1'],
    );
    assert.deepEqual(
        runTimelines.map(item => item.events.map(event => event.id)),
        [['event-2'], ['event-1', 'event-3']],
    );
    assert.deepEqual(
        runTimelines.map(item => item.timelineEvents.map(event => event.id)),
        [['run-event:event-2'], ['run-event:event-1', 'run-event:event-3']],
    );
});

test('work run timelines attach continue snapshots only to the referencing run', () => {
    const { runTimelines, unlinkedTimelineEvents } = buildWorkRunTimelines({
        runs: [{ id: 'run-2' }, { id: 'run-1' }],
        runEvents: [
            {
                ...baseEvent,
                id: 'event-1',
                runId: 'run-1',
                role: 'user',
                createdAt: '2026-06-12T10:00:00.000Z',
            },
            {
                ...baseEvent,
                id: 'event-2',
                runId: 'run-2',
                role: 'user',
                payload: {
                    workspaceSnapshotId: 'snapshot-1',
                    investigationId: 'analysis-1',
                },
                createdAt: '2026-06-12T11:00:01.000Z',
            },
        ],
        workspaceSnapshots: [
            {
                ...baseSnapshot,
                id: 'snapshot-1',
                createdAt: '2026-06-12T11:00:00.000Z',
            },
        ],
    });

    assert.equal(runTimelines[0]?.run.id, 'run-2');
    assert.equal(runTimelines[0]?.timelineEvents[0]?.snapshot?.id, 'snapshot-1');
    assert.equal(runTimelines[1]?.run.id, 'run-1');
    assert.equal(
        runTimelines[1]?.timelineEvents.some(event => event.snapshot?.id === 'snapshot-1'),
        false,
    );
    assert.equal(
        unlinkedTimelineEvents.some(event => event.snapshot?.id === 'snapshot-1'),
        false,
    );
});

test('work run timelines leave unlinked snapshots out of latest run history', () => {
    const { runTimelines, unlinkedTimelineEvents } = buildWorkRunTimelines({
        runs: [{ id: 'run-2' }],
        runEvents: [
            {
                ...baseEvent,
                id: 'event-1',
                runId: 'run-2',
                role: 'agent',
                createdAt: '2026-06-12T11:00:00.000Z',
            },
        ],
        workspaceSnapshots: [
            {
                ...baseSnapshot,
                id: 'snapshot-1',
                createdAt: '2026-06-12T10:30:00.000Z',
            },
        ],
    });

    assert.deepEqual(
        runTimelines[0]?.timelineEvents.map(event => event.id),
        ['run-event:event-1'],
    );
    assert.deepEqual(
        unlinkedTimelineEvents.map(event => event.id),
        ['workspace-snapshot:snapshot-1'],
    );
});
