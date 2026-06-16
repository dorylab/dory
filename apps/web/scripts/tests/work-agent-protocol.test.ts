import assert from 'node:assert/strict';
import test from 'node:test';

import { applyWorkAgentProtocolResult, checkWorkAgentProtocol, checkWorkAgentProtocolComplete, createWorkAgentProtocolState } from '@/lib/server/work/protocol';

function createAnalysis(state: ReturnType<typeof createWorkAgentProtocolState>, id: string) {
    assert.equal(checkWorkAgentProtocol(state, 'work_createInvestigation').allowed, true);
    applyWorkAgentProtocolResult(state, 'work_createInvestigation', { ok: true, id });
}

function createThreeAnalyses(state: ReturnType<typeof createWorkAgentProtocolState>) {
    createAnalysis(state, 'analysis-1');
    createAnalysis(state, 'analysis-2');
    createAnalysis(state, 'analysis-3');
}

function runSql(state: ReturnType<typeof createWorkAgentProtocolState>, investigationId: string) {
    assert.equal(checkWorkAgentProtocol(state, 'work_runInvestigationSql', { investigationId }).allowed, true);
    applyWorkAgentProtocolResult(state, 'work_runInvestigationSql', {
        ok: true,
        investigationId,
        tabId: `tab-${investigationId}`,
        resultMeta: {
            workRunEventId: `event-${investigationId}`,
        },
    });
}

function updateAuditStatus(
    state: ReturnType<typeof createWorkAgentProtocolState>,
    investigationId: string,
    auditStatus: 'draft' | 'reviewed' | 'revised' | 'accepted' | 'rejected',
) {
    assert.equal(checkWorkAgentProtocol(state, 'work_updateInvestigation', { id: investigationId, auditStatus }).allowed, true);
    applyWorkAgentProtocolResult(state, 'work_updateInvestigation', {
        ok: true,
        id: investigationId,
        auditStatus,
    });
}

function createFinding(state: ReturnType<typeof createWorkAgentProtocolState>, investigationId: string) {
    assert.equal(checkWorkAgentProtocol(state, 'work_createInvestigationFinding', { investigationId }).allowed, true);
    applyWorkAgentProtocolResult(state, 'work_createInvestigationFinding', {
        ok: true,
        id: `finding-${investigationId}`,
        investigationId,
    });
}

test('Work Agent protocol rejects SQL before at least three analyses exist', () => {
    const state = createWorkAgentProtocolState();
    createAnalysis(state, 'analysis-1');
    createAnalysis(state, 'analysis-2');

    const decision = checkWorkAgentProtocol(state, 'work_runInvestigationSql', { investigationId: 'analysis-1' });
    assert.equal(decision.allowed, false);
    assert.match(decision.allowed ? '' : decision.message, /at least three analyses/);
});

test('Work Agent protocol rejects more than five analyses', () => {
    const state = createWorkAgentProtocolState();
    createAnalysis(state, 'analysis-1');
    createAnalysis(state, 'analysis-2');
    createAnalysis(state, 'analysis-3');
    createAnalysis(state, 'analysis-4');
    createAnalysis(state, 'analysis-5');

    const decision = checkWorkAgentProtocol(state, 'work_createInvestigation');
    assert.equal(decision.allowed, false);
    assert.match(decision.allowed ? '' : decision.message, /no more than five analyses/i);
});

test('Work Agent protocol reuses existing analyses instead of creating title-based duplicates', () => {
    const state = createWorkAgentProtocolState({
        existingInvestigationIds: ['analysis-1', 'analysis-2', 'analysis-3'],
        existingFindingsByInvestigationId: {
            'analysis-1': 1,
            'analysis-2': 1,
            'analysis-3': 1,
        },
    });

    const createDecision = checkWorkAgentProtocol(state, 'work_createInvestigation', { title: 'Different AI title' });
    assert.equal(createDecision.allowed, false);
    assert.match(createDecision.allowed ? '' : createDecision.message, /existing Analysis IDs/);

    assert.equal(checkWorkAgentProtocol(state, 'work_runInvestigationSql', { investigationId: 'analysis-2' }).allowed, true);
});

test('Work Agent protocol treats any existing analysis as an update-only task continuation', () => {
    const state = createWorkAgentProtocolState({
        existingInvestigationIds: ['analysis-1'],
    });

    const createDecision = checkWorkAgentProtocol(state, 'work_createInvestigation');
    assert.equal(createDecision.allowed, false);
    assert.match(createDecision.allowed ? '' : createDecision.message, /Reuse the existing Analysis IDs/);
    assert.equal(checkWorkAgentProtocol(state, 'work_runInvestigationSql', { investigationId: 'analysis-1' }).allowed, true);
});

test('Work Agent protocol rejects SQL after SQL until a Finding is created', () => {
    const state = createWorkAgentProtocolState();
    createThreeAnalyses(state);
    runSql(state, 'analysis-1');

    const decision = checkWorkAgentProtocol(state, 'work_runInvestigationSql', { investigationId: 'analysis-1' });
    assert.equal(decision.allowed, false);
    assert.match(decision.allowed ? '' : decision.message, /Finding/);
});

test('Work Agent protocol rejects switching analysis before current SQL has a Finding', () => {
    const state = createWorkAgentProtocolState();
    createThreeAnalyses(state);
    runSql(state, 'analysis-1');

    const decision = checkWorkAgentProtocol(state, 'work_runInvestigationSql', { investigationId: 'analysis-2' });
    assert.equal(decision.allowed, false);
    assert.match(decision.allowed ? '' : decision.message, /Finding/);
});

test('Work Agent protocol rejects conclusion until every analysis has a Finding', () => {
    const state = createWorkAgentProtocolState();
    createThreeAnalyses(state);
    runSql(state, 'analysis-1');
    createFinding(state, 'analysis-1');

    const decision = checkWorkAgentProtocol(state, 'work_updateConclusion');
    assert.equal(decision.allowed, false);
    assert.match(decision.allowed ? '' : decision.message, /every Analysis/);
});

test('Work Agent protocol leaves SQL results included as Agent output by default', () => {
    const state = createWorkAgentProtocolState();
    createThreeAnalyses(state);
    runSql(state, 'analysis-1');

    assert.equal(state.auditStatusByInvestigationId['analysis-1'], 'draft');
});

test('Work Agent protocol allows conclusion from included Agent-output analyses', () => {
    const state = createWorkAgentProtocolState();
    createThreeAnalyses(state);
    for (const id of ['analysis-1', 'analysis-2', 'analysis-3']) {
        runSql(state, id);
        createFinding(state, id);
    }

    const decision = checkWorkAgentProtocol(state, 'work_updateConclusion');
    assert.equal(decision.allowed, true);
});

test('Work Agent protocol does not use rejected analyses for conclusion readiness', () => {
    const state = createWorkAgentProtocolState();
    createThreeAnalyses(state);
    runSql(state, 'analysis-1');
    createFinding(state, 'analysis-1');
    updateAuditStatus(state, 'analysis-1', 'rejected');

    for (const id of ['analysis-2', 'analysis-3']) {
        runSql(state, id);
        createFinding(state, id);
    }

    const decision = checkWorkAgentProtocol(state, 'work_updateConclusion');
    assert.equal(decision.allowed, true);
});

test('Work Agent protocol allows analyses, SQL, Findings, conclusion sequence', () => {
    const state = createWorkAgentProtocolState();
    createThreeAnalyses(state);

    for (const id of ['analysis-1', 'analysis-2', 'analysis-3']) {
        runSql(state, id);
        createFinding(state, id);
    }
    assert.equal(checkWorkAgentProtocol(state, 'work_updateConclusion').allowed, true);
    applyWorkAgentProtocolResult(state, 'work_updateConclusion', { ok: true });

    assert.equal(checkWorkAgentProtocolComplete(state).allowed, true);
});

test('Work Agent protocol rejects completion before conclusion update', () => {
    const state = createWorkAgentProtocolState();
    createThreeAnalyses(state);
    for (const id of ['analysis-1', 'analysis-2', 'analysis-3']) {
        runSql(state, id);
        createFinding(state, id);
    }
    const decision = checkWorkAgentProtocolComplete(state);
    assert.equal(decision.allowed, false);
    assert.match(decision.allowed ? '' : decision.message, /conclusion/);
});

test('Work Agent protocol allows continuation completion without conclusion update when configured', () => {
    const state = createWorkAgentProtocolState({
        mode: 'investigation_continue',
        investigationId: 'analysis-1',
        sourceTabId: 'tab-analysis-1',
        hasSnapshotResult: false,
        requireConclusion: false,
    });

    runSql(state, 'analysis-1');
    createFinding(state, 'analysis-1');

    const conclusionDecision = checkWorkAgentProtocol(state, 'work_updateConclusion');
    assert.equal(conclusionDecision.allowed, false);
    assert.match(conclusionDecision.allowed ? '' : conclusionDecision.message, /human can update/i);
    assert.equal(checkWorkAgentProtocolComplete(state).allowed, true);
});

test('Work Agent protocol allows existing-analysis Work continue without conclusion update when configured', () => {
    const state = createWorkAgentProtocolState({
        existingInvestigationIds: ['analysis-1', 'analysis-2'],
        existingFindingsByInvestigationId: {
            'analysis-1': 1,
            'analysis-2': 1,
        },
        requireConclusion: false,
    });

    const conclusionDecision = checkWorkAgentProtocol(state, 'work_updateConclusion');
    assert.equal(conclusionDecision.allowed, false);
    assert.match(conclusionDecision.allowed ? '' : conclusionDecision.message, /human can update/i);
    assert.equal(checkWorkAgentProtocolComplete(state).allowed, true);
});

test('Work Agent protocol requires existing-analysis continuation conclusion by default', () => {
    const state = createWorkAgentProtocolState({
        existingInvestigationIds: ['analysis-1', 'analysis-2'],
        existingFindingsByInvestigationId: {
            'analysis-1': 1,
            'analysis-2': 1,
        },
    });

    const completionDecision = checkWorkAgentProtocolComplete(state);
    assert.equal(completionDecision.allowed, false);
    assert.match(completionDecision.allowed ? '' : completionDecision.message, /conclusion/);

    assert.equal(checkWorkAgentProtocol(state, 'work_updateConclusion').allowed, true);
    applyWorkAgentProtocolResult(state, 'work_updateConclusion', { ok: true });
    assert.equal(checkWorkAgentProtocolComplete(state).allowed, true);
});

test('Work Agent protocol allows snapshot continuation without three new analyses', () => {
    const state = createWorkAgentProtocolState({
        mode: 'investigation_continue',
        investigationId: 'analysis-1',
        sourceTabId: 'tab-analysis-1',
        hasSnapshotResult: false,
    });

    const decision = checkWorkAgentProtocol(state, 'work_runInvestigationSql', { investigationId: 'analysis-1' });
    assert.equal(decision.allowed, true);
});

test('Work Agent protocol keeps snapshot continuation scoped to current analysis', () => {
    const state = createWorkAgentProtocolState({
        mode: 'investigation_continue',
        investigationId: 'analysis-1',
        sourceTabId: 'tab-analysis-1',
        hasSnapshotResult: false,
    });

    const createDecision = checkWorkAgentProtocol(state, 'work_createInvestigation');
    assert.equal(createDecision.allowed, false);
    assert.match(createDecision.allowed ? '' : createDecision.message, /current Analysis/);

    const sqlDecision = checkWorkAgentProtocol(state, 'work_runInvestigationSql', { investigationId: 'analysis-2' });
    assert.equal(sqlDecision.allowed, false);
    assert.match(sqlDecision.allowed ? '' : sqlDecision.message, /workspace snapshot/);
});

test('Work Agent protocol allows finding from snapshot result before conclusion', () => {
    const state = createWorkAgentProtocolState({
        mode: 'investigation_continue',
        investigationId: 'analysis-1',
        sourceTabId: 'tab-analysis-1',
        hasSnapshotResult: true,
        existingAuditStatusByInvestigationId: {
            'analysis-1': 'accepted',
        },
    });

    assert.equal(checkWorkAgentProtocol(state, 'work_createInvestigationFinding', { investigationId: 'analysis-1' }).allowed, true);
    applyWorkAgentProtocolResult(state, 'work_createInvestigationFinding', {
        ok: true,
        id: 'finding-analysis-1',
        investigationId: 'analysis-1',
    });

    assert.equal(checkWorkAgentProtocol(state, 'work_updateConclusion').allowed, true);
    applyWorkAgentProtocolResult(state, 'work_updateConclusion', { ok: true });
    assert.equal(checkWorkAgentProtocolComplete(state).allowed, true);
});
