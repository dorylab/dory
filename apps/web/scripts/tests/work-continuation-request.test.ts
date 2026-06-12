import assert from 'node:assert/strict';
import test from 'node:test';

import { buildContinueAgentRunFetchInit, buildContinueAgentRunRequestBody } from '@/lib/work/continue-agent-request';

const snapshot = {
    investigationId: 'investigation-1',
    workspaceId: 'tab-1',
    intent: 'continue_analysis' as const,
    humanEdits: {
        sql: 'select count(*) as orders from orders;',
        resultPreview: {
            sessionId: 'session-1',
            rowCount: 1,
            rows: [{ orders: 42 }],
        },
        chartConfig: null,
        selectedRows: null,
        userNote: null,
        changeSummary: {
            sqlEdited: true,
            resultRefreshed: true,
            chartConfigChanged: false,
            selectedRowsChanged: false,
        },
    },
};

test('Continue Agent request sends workspace snapshot with previous Agent step', () => {
    const body = buildContinueAgentRunRequestBody({
        snapshot,
        previousAgentStepId: 'event-agent-1',
    });

    assert.deepEqual(body, {
        workspaceSnapshot: {
            ...snapshot,
            previousAgentStepId: 'event-agent-1',
        },
    });
});

test('Continue Agent request sends workspace snapshot even without a previous Agent step', () => {
    const body = buildContinueAgentRunRequestBody({
        snapshot,
        previousAgentStepId: null,
    });

    assert.equal('workspaceSnapshot' in (body ?? {}), true);
    assert.equal((body as { workspaceSnapshot: typeof snapshot & { previousAgentStepId: string | null } }).workspaceSnapshot.previousAgentStepId, null);
});

test('Continue Agent request falls back to focused investigation when snapshot controller is unavailable', () => {
    const body = buildContinueAgentRunRequestBody({
        focusInvestigationId: ' investigation-1 ',
    });

    assert.deepEqual(body, {
        focusInvestigationId: 'investigation-1',
    });
});

test('Continue Agent fetch init omits JSON body only when there is no snapshot or focus', () => {
    const emptyInit = buildContinueAgentRunFetchInit({});
    assert.equal(emptyInit.method, 'POST');
    assert.equal(emptyInit.headers, undefined);
    assert.equal(emptyInit.body, undefined);

    const snapshotInit = buildContinueAgentRunFetchInit({
        snapshot,
        previousAgentStepId: 'event-agent-1',
    });
    assert.deepEqual(snapshotInit.headers, { 'Content-Type': 'application/json' });
    assert.deepEqual(JSON.parse(String(snapshotInit.body)), {
        workspaceSnapshot: {
            ...snapshot,
            previousAgentStepId: 'event-agent-1',
        },
    });
});
