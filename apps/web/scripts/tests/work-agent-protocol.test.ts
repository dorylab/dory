import assert from 'node:assert/strict';
import test from 'node:test';

import { applyWorkAgentProtocolResult, checkWorkAgentProtocol, checkWorkAgentProtocolComplete, createWorkAgentProtocolState } from '@/lib/server/work/protocol';

test('Work Agent protocol rejects SQL before an investigation exists', () => {
    const state = createWorkAgentProtocolState();
    const decision = checkWorkAgentProtocol(state, 'work_runInvestigationSql');

    assert.equal(decision.allowed, false);
    assert.match(decision.allowed ? '' : decision.message, /Create an investigation/);
});

test('Work Agent protocol rejects consecutive SQL before summary update', () => {
    const state = createWorkAgentProtocolState();
    applyWorkAgentProtocolResult(state, 'work_createInvestigation', { ok: true, id: 'investigation-1' });

    assert.equal(checkWorkAgentProtocol(state, 'work_runInvestigationSql', { investigationId: 'investigation-1' }).allowed, true);
    applyWorkAgentProtocolResult(state, 'work_runInvestigationSql', { ok: true, rows: [] });

    const decision = checkWorkAgentProtocol(state, 'work_runInvestigationSql', { investigationId: 'investigation-1' });
    assert.equal(decision.allowed, false);
    assert.match(decision.allowed ? '' : decision.message, /summary/);
});

test('Work Agent protocol rejects conclusion before completed investigation summary', () => {
    const state = createWorkAgentProtocolState();
    applyWorkAgentProtocolResult(state, 'work_createInvestigation', { ok: true, id: 'investigation-1' });

    const decision = checkWorkAgentProtocol(state, 'work_updateConclusion');
    assert.equal(decision.allowed, false);
    assert.match(decision.allowed ? '' : decision.message, /summary/);
});

test('Work Agent protocol rejects summary before SQL and summary for a non-current investigation', () => {
    const state = createWorkAgentProtocolState();
    applyWorkAgentProtocolResult(state, 'work_createInvestigation', { ok: true, id: 'investigation-1' });

    const earlySummary = checkWorkAgentProtocol(state, 'work_updateInvestigationSummary', { id: 'investigation-1' });
    assert.equal(earlySummary.allowed, false);
    assert.match(earlySummary.allowed ? '' : earlySummary.message, /Run SQL/);

    applyWorkAgentProtocolResult(state, 'work_runInvestigationSql', { ok: true, rows: [] });
    const wrongInvestigation = checkWorkAgentProtocol(state, 'work_updateInvestigationSummary', { id: 'investigation-2' });
    assert.equal(wrongInvestigation.allowed, false);
    assert.match(wrongInvestigation.allowed ? '' : wrongInvestigation.message, /current investigation/);
});

test('Work Agent protocol allows investigation, SQL, summary, conclusion sequence', () => {
    const state = createWorkAgentProtocolState();

    assert.equal(checkWorkAgentProtocol(state, 'work_createInvestigation').allowed, true);
    applyWorkAgentProtocolResult(state, 'work_createInvestigation', { ok: true, id: 'investigation-1' });

    assert.equal(checkWorkAgentProtocol(state, 'work_runInvestigationSql', { investigationId: 'investigation-1' }).allowed, true);
    applyWorkAgentProtocolResult(state, 'work_runInvestigationSql', { ok: true, rows: [] });

    assert.equal(checkWorkAgentProtocol(state, 'work_updateInvestigationSummary', { id: 'investigation-1' }).allowed, true);
    applyWorkAgentProtocolResult(state, 'work_updateInvestigationSummary', { ok: true, id: 'investigation-1' });

    assert.equal(checkWorkAgentProtocol(state, 'work_updateConclusion').allowed, true);
    applyWorkAgentProtocolResult(state, 'work_updateConclusion', { ok: true });

    assert.equal(checkWorkAgentProtocolComplete(state).allowed, true);
});

test('Work Agent protocol rejects SQL for a non-current investigation', () => {
    const state = createWorkAgentProtocolState();
    applyWorkAgentProtocolResult(state, 'work_createInvestigation', { ok: true, id: 'investigation-1' });

    const decision = checkWorkAgentProtocol(state, 'work_runInvestigationSql', { investigationId: 'investigation-2' });
    assert.equal(decision.allowed, false);
    assert.match(decision.allowed ? '' : decision.message, /current investigation/);
});

test('Work Agent protocol rejects completion while summary is pending', () => {
    const state = createWorkAgentProtocolState();
    applyWorkAgentProtocolResult(state, 'work_createInvestigation', { ok: true, id: 'investigation-1' });
    applyWorkAgentProtocolResult(state, 'work_runInvestigationSql', { ok: true, rows: [] });

    const decision = checkWorkAgentProtocolComplete(state);
    assert.equal(decision.allowed, false);
    assert.match(decision.allowed ? '' : decision.message, /summary/);
});

test('Work Agent protocol rejects completion before conclusion update', () => {
    const state = createWorkAgentProtocolState();
    applyWorkAgentProtocolResult(state, 'work_createInvestigation', { ok: true, id: 'investigation-1' });
    applyWorkAgentProtocolResult(state, 'work_runInvestigationSql', { ok: true, rows: [] });
    applyWorkAgentProtocolResult(state, 'work_updateInvestigationSummary', { ok: true, id: 'investigation-1' });

    const decision = checkWorkAgentProtocolComplete(state);
    assert.equal(decision.allowed, false);
    assert.match(decision.allowed ? '' : decision.message, /conclusion/);
});
