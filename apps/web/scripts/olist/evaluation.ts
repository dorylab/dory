import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { OSSIE_VERSION } from '@dory/shared/types/ossie';

import { assertEvaluationRows, OLIST_KNOWLEDGE_NAME, olistScenarios, type EvaluationLayer, type EvaluationRow, type OlistScenario } from '@/lib/demo/olist-evaluation';
import { toolPayload } from '../commerce-agent-evaluation-mcp-replay';
import { updateOlistReport } from './report';

export type JsonRecord = Record<string, unknown>;
export type ToolCall = { tool: string; input: JsonRecord; output: JsonRecord };
export type EvaluationResult = {
    scenarioId: string;
    question: string;
    status: 'passed' | 'failed';
    layer: EvaluationLayer;
    workId?: string;
    workspaceUrl?: string;
    semanticModel?: JsonRecord;
    sql?: string[];
    expectedRows?: EvaluationRow[];
    actualRows?: EvaluationRow[];
    evidenceArtifactIds?: string[];
    inspectionArtifactIds?: string[];
    error?: string;
    calls?: ToolCall[];
};
export const record = (value: unknown): value is JsonRecord => typeof value === 'object' && value !== null && !Array.isArray(value);
export const string = (value: unknown, field: string): string => {
    assert.ok(typeof value === 'string' && value, `Missing ${field}`);
    return value;
};
export type CallTool = (tool: string, input: JsonRecord) => Promise<JsonRecord>;

export function assertSemanticContext(work: JsonRecord, scenario: OlistScenario, modelRevision: string) {
    const models = Array.isArray(work.semanticModelsUsed) ? work.semanticModelsUsed.filter(record) : [];
    const model = models.find(item => item.name === OLIST_KNOWLEDGE_NAME);
    assert.ok(model, 'Expected Olist semantic model');
    assert.equal(model.ossieVersion, OSSIE_VERSION);
    assert.equal(model.modelRevision, modelRevision, 'Unexpected Knowledge revision');
    const context = string(work.semanticContext, 'semanticContext');
    for (const name of scenario.semanticNames) {
        assert.ok(context.includes(name), `Missing semantic construct ${name}`);
        assert.ok(
            [...(Array.isArray(model.metricNames) ? model.metricNames : []), ...(Array.isArray(model.relationshipNames) ? model.relationshipNames : [])].includes(name),
            `Unrecorded semantic construct ${name}`,
        );
    }
    return model;
}

export async function readEvidence(call: CallTool, workId: string, artifactIds: string[], expected: EvaluationRow[]) {
    assert.ok(artifactIds.length, 'Missing persisted evidence');
    for (const artifactId of artifactIds) {
        const result = await call('dory_artifacts', { workId, artifactId, previewRows: 200 });
        assert.ok(record(result.artifact) && result.artifact.workId === workId, 'Artifact belongs to another Run');
        assert.ok(record(result.preview) && result.preview.limited === false, 'Artifact preview missing or truncated');
        assertEvaluationRows(result.preview.rows, expected);
    }
}

function artifactRows(calls: ToolCall[], execution: ToolCall, artifactId: string): EvaluationRow[] {
    const artifacts = Array.isArray(execution.output.artifacts) ? execution.output.artifacts.filter(record) : [];
    const index = artifacts.findIndex(a => a.artifactId === artifactId);
    assert.ok(index >= 0, 'Artifact not produced by this execution');
    if (index === 0) return execution.output.result as EvaluationRow[];
    // Multi-statement facade responses expose only the first result inline.
    // Later results must have been explicitly read by the Agent, then are
    // independently read back again by the evaluator.
    const read = calls.find(c => c.tool === 'dory_artifacts' && c.input.artifactId === artifactId);
    assert.ok(read && record(read.output.preview) && read.output.preview.limited === false, 'Agent did not read this later Result Set');
    assert.ok(record(read.output.artifact) && read.output.artifact.workId === execution.input.workId, 'Later Result Set has incorrect ownership');
    assert.ok(Array.isArray(read.output.preview.rows), 'Missing later Result Set rows');
    return read.output.preview.rows as EvaluationRow[];
}

export async function replayOlist(call: CallTool, connectionId: string, modelRevision: string, scenarios: OlistScenario[], expected: Record<string, EvaluationRow[]>) {
    const results: EvaluationResult[] = [];
    for (const scenario of scenarios.filter(item => !item.unavailable)) {
        let layer: EvaluationLayer = 'context';
        let workId: string | undefined;
        const calls: ToolCall[] = [];
        const tracked: CallTool = async (tool, input) => {
            const output = await call(tool, input);
            calls.push({ tool, input, output });
            return output;
        };
        try {
            const work = await tracked('dory_create_work', { connectionId, title: scenario.title, userQuestion: scenario.question });
            workId = string(work.workId, 'workId');
            const model = assertSemanticContext(work, scenario, modelRevision);
            layer = 'knowledge';
            const assets = await tracked('dory_search_assets', {
                connectionId,
                knowledgeModelId: model.id,
                query: scenario.question,
                kinds: ['knowledge_definition', 'knowledge_source'],
                workId,
            });
            const asset = Array.isArray(assets.assets) ? assets.assets.find(record) : undefined;
            await tracked('dory_read_asset', { workId, ref: string(asset?.ref, 'Knowledge asset') });
            await tracked('dory_explore_schema', { connectionId, database: 'main', workId, operation: 'list_tables' });
            layer = 'sql';
            const sql = await tracked('dory_run_readonly_sql', { connectionId, database: 'main', workId, sql: scenario.sql, tabName: scenario.title, maxRows: 200 });
            assert.equal(sql.truncated, false);
            assertEvaluationRows(sql.result, expected[scenario.id]);
            layer = 'artifact';
            const artifactIds = Array.isArray(sql.artifacts) ? sql.artifacts.filter(record).map(a => string(a.artifactId, 'artifactId')) : [];
            await readEvidence(tracked, workId, artifactIds, expected[scenario.id]);
            layer = 'run-ui';
            await tracked('dory_finish_work', {
                workId,
                status: 'completed',
                summaryTitle: scenario.title,
                findings: [{ title: scenario.title, content: JSON.stringify(sql.result), evidenceArtifactIds: artifactIds, isPrimary: true }],
                steps: [
                    'Verified automatic Knowledge context and exact model revision.',
                    'Read Knowledge and inspected schema.',
                    'Compared MCP SQL results and persisted Artifact with independent CSV oracle.',
                ],
            });
            results.push({
                scenarioId: scenario.id,
                question: scenario.question,
                status: 'passed',
                layer,
                workId,
                workspaceUrl: String(sql.workspaceUrl),
                semanticModel: model,
                sql: [scenario.sql],
                evidenceArtifactIds: artifactIds,
                expectedRows: expected[scenario.id],
                actualRows: sql.result as EvaluationRow[],
                calls,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (workId) await call('dory_finish_work', { workId, status: 'error', findings: [], steps: [`Acceptance failed at ${layer}: ${message}`] }).catch(() => undefined);
            results.push({ scenarioId: scenario.id, question: scenario.question, status: 'failed', layer, workId, error: message, calls });
        }
    }
    return results;
}

export function codexCalls(events: unknown[]): ToolCall[] {
    const calls: ToolCall[] = [];
    for (const event of events) {
        if (!record(event) || event.type !== 'item.completed' || !record(event.item)) continue;
        const item = event.item;
        assert.ok(!['command_execution', 'file_change', 'web_search'].includes(String(item.type)), 'Agent used a source outside Dory MCP');
        if (item.type !== 'mcp_tool_call') continue;
        assert.equal(item.server, 'dory', 'Unexpected MCP source');
        assert.equal(item.status, 'completed', 'MCP call failed');
        assert.ok(record(item.arguments), 'Missing MCP arguments');
        calls.push({ tool: string(item.tool, 'tool name'), input: item.arguments, output: toolPayload(item.result) });
    }
    return calls;
}

export async function validateAgent(
    call: CallTool,
    calls: ToolCall[],
    answer: JsonRecord,
    scenario: OlistScenario,
    expected: EvaluationRow[],
    connectionId: string,
    modelRevision: string,
) {
    const created = calls.find(c => c.tool === 'dory_create_work');
    assert.ok(created, 'Agent did not create a Run');
    assert.equal(calls[0], created, 'Agent must create its Run before other discovery');
    assert.equal(calls.filter(c => c.tool === 'dory_create_work').length, 1, 'Each scenario must use one Run');
    assert.equal(created.input.connectionId, connectionId);
    assert.equal(created.input.userQuestion, scenario.question, 'Run must preserve the original question');
    const workId = string(created.output.workId, 'workId');
    assert.equal(answer.workId, workId);
    const model = assertSemanticContext(created.output, scenario, modelRevision);
    const search = calls.findIndex(c => c.tool === 'dory_search_assets');
    const read = calls.findIndex(c => c.tool === 'dory_read_asset');
    const schema = calls.findIndex(c => c.tool === 'dory_explore_schema');
    const finish = calls.findLast(c => c.tool === 'dory_finish_work');
    assert.ok(search >= 0 && read > search && schema >= 0, 'Missing explicit Knowledge and schema discovery');
    assert.ok(finish && finish.input.status === 'completed', 'Agent did not complete its Run');
    for (const entry of calls.filter(c => c.tool !== 'dory_create_work')) assert.equal(entry.input.workId, workId, 'Tool activity escaped the Run');
    assert.ok(Array.isArray(finish.input.findings), 'Missing Findings');
    const executed = calls.filter(c => c.tool === 'dory_run_readonly_sql');
    for (const execution of executed) assert.equal(execution.input.connectionId, connectionId);
    if (scenario.unavailable) {
        assert.equal(answer.status, 'unavailable');
        assert.deepEqual(answer.rows, []);
        assert.deepEqual(answer.missingMetrics, ['refund_rate', 'net_profit', 'payment_success_rate']);
        assert.deepEqual(finish.input.findings, [], 'Unavailable metrics must not create analytical Findings');
        const explanation = string(answer.answer, 'limitation explanation');
        for (const term of ['退款', '成本', '支付']) assert.ok(explanation.includes(term), `Missing reason: ${term}`);
        const inspectionArtifactIds = Array.isArray(answer.evidenceArtifactIds) ? answer.evidenceArtifactIds.map(id => string(id, 'inspection Artifact')) : [];
        for (const id of inspectionArtifactIds) {
            const execution = executed.find(c => Array.isArray(c.output.artifacts) && c.output.artifacts.some(a => record(a) && a.artifactId === id));
            assert.ok(execution, 'Diagnostic Artifact was not produced by this Agent');
            assert.equal(execution.output.truncated, false);
            await readEvidence(call, workId, [id], artifactRows(calls, execution, id));
        }
        return { workId, semanticModel: model, sql: executed.map(c => string(c.input.sql, 'diagnostic SQL')), actualRows: [], evidenceArtifactIds: [], inspectionArtifactIds };
    }
    assert.equal(answer.status, 'measured');
    assertEvaluationRows(answer.rows, expected);
    const artifactIds = Array.isArray(answer.evidenceArtifactIds) ? answer.evidenceArtifactIds.map(id => string(id, 'evidenceArtifactId')) : [];
    assert.ok(executed.length && calls.indexOf(executed[0]) > Math.max(read, schema), 'SQL ran before Knowledge/schema discovery');
    assert.ok(calls.indexOf(finish) > calls.indexOf(executed.at(-1)!), 'Run finished before SQL');
    for (const execution of executed) assert.equal(execution.input.connectionId, connectionId);
    let measuredEvidence = false;
    for (const id of artifactIds) {
        const execution = executed.find(c => Array.isArray(c.output.artifacts) && c.output.artifacts.some(a => record(a) && a.artifactId === id));
        assert.ok(execution, 'Answer cites an Artifact not produced by this Agent');
        assert.equal(execution.output.truncated, false);
        const rows = artifactRows(calls, execution, id);
        try {
            assertEvaluationRows(rows, expected);
            measuredEvidence = true;
        } catch {
            /* Auxiliary quality queries can support the measured result. */
        }
        assert.ok(
            finish.input.findings.some(f => record(f) && Array.isArray(f.evidenceArtifactIds) && f.evidenceArtifactIds.includes(id)),
            'Finding omitted answer evidence',
        );
        await readEvidence(call, workId, [id], rows);
    }
    assert.ok(measuredEvidence, 'No cited SQL Artifact supports the measured answer');
    return {
        workId,
        semanticModel: model,
        sql: executed.map(c => string(c.input.sql, 'executed SQL')),
        actualRows: answer.rows as EvaluationRow[],
        evidenceArtifactIds: artifactIds,
        workspaceUrl: String(created.output.workspaceUrl),
    };
}

export async function writeEvaluationReport(directory: string, mode: string, results: EvaluationResult[], metadata: JsonRecord = {}) {
    const expectedIds = olistScenarios('2026-10-15')
        .filter(s => mode !== 'mcp' || !s.unavailable)
        .map(s => s.id)
        .sort();
    const complete = JSON.stringify(results.map(r => r.scenarioId).sort()) === JSON.stringify(expectedIds);
    const selectionOk = results.length > 0 && results.every(r => r.status === 'passed');
    const report = { ...metadata, recordedAt: new Date().toISOString(), mode, complete, selectionOk, ok: complete && selectionOk, uiStatus: 'not-run', results };
    const previousPath = path.join(directory, `${mode}-results.json`);
    const previous = await readFile(previousPath, 'utf8').catch(error => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
    });
    if (previous) {
        const history = path.join(directory, 'attempts');
        await mkdir(history, { recursive: true });
        await copyFile(previousPath, path.join(history, `${mode}-${Date.now()}.json`));
    }
    await writeFile(path.join(directory, `${mode}-results.json`), JSON.stringify(report, null, 2) + '\n');
    const lines = [
        `# Olist ${mode} acceptance`,
        '',
        `Status: ${report.ok ? 'passed' : 'failed'}; UI verification is separate.`,
        '',
        '| Scenario | Status | Layer | Run |',
        '| --- | --- | --- | --- |',
        ...results.map(r => `| ${r.scenarioId} | ${r.status} | ${r.layer} | ${r.workId ?? ''} |`),
        '',
        ...results.filter(r => r.error).map(r => `${r.scenarioId}: ${r.error}`),
    ];
    await writeFile(path.join(directory, `${mode}-report.md`), lines.join('\n') + '\n');
    await updateOlistReport(directory);
    return report;
}
