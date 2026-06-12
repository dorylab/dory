import assert from 'node:assert/strict';
import test from 'node:test';

import { effectiveInvestigationStatus, investigationActivityDisplay, runningInvestigationIdsFromRunEvents } from '@/lib/work/investigation-card-state';

test('running run events mark the matching Analysis as running', () => {
    const events = [
        {
            type: 'message',
            role: 'user',
            payload: {
                investigationId: 'analysis-1',
                workspaceSnapshotId: 'snapshot-1',
            },
            createdAt: '2026-06-12T12:00:00.000Z',
        },
    ];

    assert.deepEqual([...runningInvestigationIdsFromRunEvents({ status: 'running' }, events)], ['analysis-1']);
    assert.equal(
        effectiveInvestigationStatus({
            investigation: {
                id: 'analysis-1',
                status: 'draft',
            },
            latestRun: { status: 'running' },
            latestRunEvents: events,
        }),
        'running',
    );
});

test('inactive draft Analysis with evidence is displayed as completed', () => {
    assert.equal(
        effectiveInvestigationStatus({
            investigation: {
                id: 'analysis-1',
                status: 'draft',
                lastQueryAt: '2026-06-12T12:00:00.000Z',
                findings: [],
                sqlAssetCount: 0,
            },
            latestRun: { status: 'completed' },
            latestRunEvents: [],
        }),
        'completed',
    );
});

test('snapshot handoff event is displayed as the latest user run time', () => {
    const activity = investigationActivityDisplay({
        investigation: {
            id: 'analysis-1',
            status: 'draft',
            lastQueryAt: '2026-06-12T11:00:00.000Z',
        },
        latestRunEvents: [
            {
                type: 'message',
                role: 'user',
                payload: {
                    investigationId: 'analysis-1',
                    workspaceSnapshotId: 'snapshot-1',
                },
                createdAt: '2026-06-12T12:00:00.000Z',
            },
        ],
    });

    assert.deepEqual(activity, {
        label: 'Last user run',
        value: '2026-06-12T12:00:00.000Z',
    });
});
