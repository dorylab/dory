import assert from 'node:assert/strict';
import test from 'node:test';

import { buildWorkTimelineEvents } from '@/lib/work/timeline';

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
