import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { OSSIE_VERSION } from '@dory/shared/types/ossie';

import { COMMERCE_EVALUATION_KNOWLEDGE_NAME } from '@/lib/demo/commerce-agent-evaluation';
import { COMMERCE_EVALUATION_SCENARIOS } from '@/lib/demo/commerce-agent-evaluation-knowledge';

type JsonRecord = Record<string, unknown>;
type CallTool = (name: string, args: JsonRecord) => Promise<JsonRecord>;

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toolPayload(result: unknown): JsonRecord {
    if (!isRecord(result) || result.isError) throw new Error('MCP tool failed.');
    let payload: unknown = result.structuredContent;
    if (!isRecord(payload) && Array.isArray(result.content)) {
        const text = result.content.find(item => isRecord(item) && item.type === 'text');
        if (isRecord(text) && typeof text.text === 'string') payload = JSON.parse(text.text);
    }
    if (!isRecord(payload)) throw new Error('MCP tool returned an unexpected payload.');
    if (payload.error || payload.ok === false) throw new Error(`MCP tool failed: ${JSON.stringify(payload.error ?? payload)}`);
    return payload;
}

function requireString(value: unknown, field: string) {
    if (typeof value !== 'string' || !value) throw new Error(`Missing ${field} in MCP response.`);
    return value;
}

// Persisted result sets serialize numeric cells as strings. Normalize only columns
// whose golden SQL output is numeric; identifiers and nulls remain unchanged.
export function normalizeArtifactRows(value: unknown, expected: readonly JsonRecord[]) {
    assert.ok(Array.isArray(value));
    return value.map((row: unknown, index: number) => {
        assert.ok(isRecord(row));
        return Object.fromEntries(
            Object.entries(row).map(([key, cell]) => {
                const numeric = typeof expected[index]?.[key] === 'number' && typeof cell === 'string' && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(cell);
                return [key, numeric ? Number(cell) : cell];
            }),
        );
    });
}

export async function replayCommerceEvaluation(call: CallTool, connectionId: string) {
    const results: JsonRecord[] = [];
    for (const scenario of COMMERCE_EVALUATION_SCENARIOS) {
        let workId: string | undefined;
        try {
            const work = await call('dory_create_work', { connectionId, title: scenario.title, userQuestion: scenario.question });
            workId = requireString(work.workId, 'workId');
            const semanticContext = requireString(work.semanticContext, 'semanticContext');
            const models = Array.isArray(work.semanticModelsUsed) ? work.semanticModelsUsed.filter(isRecord) : [];
            const model = models.find(item => item.name === COMMERCE_EVALUATION_KNOWLEDGE_NAME);
            assert.ok(model, 'Expected commerce semantic model before explicit Knowledge discovery.');
            assert.equal(model.ossieVersion, OSSIE_VERSION);
            assert.match(requireString(model.modelRevision, 'modelRevision'), /^[a-f0-9]{64}$/);
            for (const id of scenario.expectedSemanticIds) {
                const name = id.slice(id.indexOf(':') + 1);
                assert.ok(semanticContext.includes(name), `Missing ${id} for ${scenario.id}`);
                if (id.startsWith('metric:')) assert.ok(Array.isArray(model.metricNames) && model.metricNames.includes(name), `Missing selected metric ${name}`);
                if (id.startsWith('relationship:'))
                    assert.ok(Array.isArray(model.relationshipNames) && model.relationshipNames.includes(name), `Missing selected relationship ${name}`);
            }
            const assets = await call('dory_search_assets', {
                connectionId,
                knowledgeModelId: model.id,
                query: scenario.question,
                kinds: ['knowledge_definition', 'verified_query'],
                workId,
            });
            const asset = Array.isArray(assets.assets) ? assets.assets.filter(isRecord)[0] : undefined;
            const ref = requireString(asset?.ref, 'Knowledge asset ref');
            await call('dory_read_asset', { ref, workId });
            await call('dory_explore_schema', { operation: 'list_tables', connectionId, database: 'main', workId });
            const sql = await call('dory_run_readonly_sql', {
                connectionId,
                workId,
                database: 'main',
                maxRows: 100,
                workspaceMode: 'create_tab',
                tabName: scenario.title,
                sql: scenario.sql,
            });
            assert.equal(sql.truncated, false, 'Results must not be truncated.');
            assert.deepEqual(sql.result, scenario.expectedRows, `Golden result mismatch: ${scenario.id}`);
            const artifacts = Array.isArray(sql.artifacts) ? sql.artifacts.filter(isRecord) : [];
            const evidenceArtifactIds = artifacts.map(item => requireString(item.artifactId, 'artifactId'));
            assert.ok(evidenceArtifactIds.length, 'SQL must persist an Artifact.');
            const artifactReadbacks: JsonRecord[] = [];
            for (const artifactId of evidenceArtifactIds) {
                const saved = await call('dory_artifacts', { artifactId, previewRows: 100, workId });
                assert.ok(isRecord(saved.artifact) && saved.artifact.workId === workId, 'Artifact must belong to this Run.');
                assert.ok(isRecord(saved.preview), 'Artifact must have a readable preview.');
                assert.equal(saved.preview.limited, false);
                assert.deepEqual(normalizeArtifactRows(saved.preview.rows, scenario.expectedRows), sql.result, 'Persisted Artifact differs from SQL result.');
                artifactReadbacks.push({ artifactId, rows: saved.preview.rows });
            }
            const rows = sql.result;
            await call('dory_finish_work', {
                workId,
                status: 'completed',
                summaryTitle: scenario.title,
                // This deterministic replay validates transport and result integrity; it does not run an analysis Agent.
                findings: [],
                steps: [
                    'Verified automatic semantic context before explicit Knowledge discovery.',
                    'Read verified Knowledge and inspected the source schema.',
                    'Executed the scenario SQL and matched every row against the shared golden results.',
                    'Read back the persisted Artifact and verified its rows and Run ownership.',
                ],
            });
            results.push({
                scenarioId: scenario.id,
                status: 'passed',
                question: scenario.question,
                sql: scenario.sql,
                expectedSemanticIds: scenario.expectedSemanticIds,
                expectedRows: scenario.expectedRows,
                actualRows: rows,
                workId,
                workspaceUrl: sql.workspaceUrl,
                semanticModel: model,
                evidenceArtifactIds,
                artifactReadbacks,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            let finishError: string | undefined;
            if (workId) {
                try {
                    await call('dory_finish_work', { workId, status: 'error', findings: [], steps: [`Acceptance failed: ${message}`.slice(0, 500)] });
                } catch (error) {
                    finishError = error instanceof Error ? error.message : String(error);
                    console.error('[commerce-agent-evaluation:mcp] failed to finish Run', { workId, error: finishError });
                }
            }
            results.push({
                scenarioId: scenario.id,
                status: 'failed',
                question: scenario.question,
                sql: scenario.sql,
                workId,
                error: message,
                ...(finishError ? { finishError } : {}),
            });
        }
    }
    return { ok: results.every(item => item.status === 'passed'), connectionId, scenarios: results };
}

async function main() {
    const token = process.env.DORY_MCP_TOKEN;
    if (!token) throw new Error('Set DORY_MCP_TOKEN to an existing service-account token with schema, query, assets and Agent workspace scopes.');
    const endpoint = process.env.DORY_MCP_URL ?? 'http://localhost:3000/api/mcp';
    const connectionId = process.env.DORY_COMMERCE_EVALUATION_CONNECTION_ID;
    if (!connectionId) throw new Error('Set DORY_COMMERCE_EVALUATION_CONNECTION_ID to the explicit seed connectionId.');
    const client = new Client({ name: 'commerce-agent-evaluation-replay', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(endpoint), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
    try {
        const report = await replayCommerceEvaluation(async (name, args) => toolPayload(await client.callTool({ name, arguments: args })), connectionId);
        const outputDir = path.resolve(
            process.env.DORY_COMMERCE_EVALUATION_OUTPUT_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'localdata', 'commerce-knowledge-acceptance'),
        );
        await mkdir(outputDir, { recursive: true });
        await writeFile(path.join(outputDir, 'mcp-results.json'), JSON.stringify({ endpoint, recordedAt: new Date().toISOString(), ...report }, null, 2));
        console.log(
            JSON.stringify(
                {
                    ok: report.ok,
                    connectionId,
                    outputDir,
                    scenarios: report.scenarios.map(item => ({ scenarioId: item.scenarioId, status: item.status, workId: item.workId, error: item.error })),
                },
                null,
                2,
            ),
        );
        if (!report.ok) process.exitCode = 1;
    } finally {
        await client.close();
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error('[commerce-agent-evaluation:mcp] failed', error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}
