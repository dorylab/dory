import { spawn, spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { olistScenarios, type EvaluationRow } from '@/lib/demo/olist-evaluation';
import { toolPayload } from './commerce-agent-evaluation-mcp-replay';
import { codexCalls, record, replayOlist, validateAgent, writeEvaluationReport, type CallTool, type EvaluationResult } from './olist/evaluation';
import { verifyOlistFixture } from './olist/fixture';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = ['dory_create_work', 'dory_finish_work', 'dory_search_assets', 'dory_read_asset', 'dory_explore_schema', 'dory_run_readonly_sql', 'dory_artifacts'];

export function agentPrompt(question: string, connectionId: string, columns: string[]) {
    return [
        `User question: ${question}`,
        `Connection ID: ${connectionId}; database: main.`,
        'Use only Dory MCP. Do not use shell, filesystem, web search, other MCP servers, or precomputed evaluation answers.',
        'First call dory_create_work with this exact user question as userQuestion and the connectionId. Read its semanticContext BEFORE planning SQL.',
        'Then search and explicitly read relevant Knowledge; inspect the source schema. Pass the returned workId to every subsequent tool.',
        'Independently write and execute read-only SQL, read back its Artifact, and finish the Run. Every measured Finding must cite the produced Artifact IDs.',
        'If required data is absent, explain the missing fields and finish with findings: []; never substitute a different metric.',
        'Keep all source timestamps unchanged and use integer cents for monetary output. Return ratios in [0,1], not percentages, without rounding.',
        'Numeric result columns must be JSON numbers, including AOV and ratios; never return fraction strings or formatted numbers.',
        columns.length
            ? `The result row keys must be exactly: ${columns.join(', ')}. These specify output shape, not a SQL solution.`
            : 'Return no result rows. missingMetrics must be ["refund_rate","net_profit","payment_success_rate"] in that order. Explain each missing field in Chinese.',
        'Return JSON with workId, status (measured or unavailable), answer (Chinese), rows, evidenceArtifactIds and missingMetrics. Do not claim that an evaluation passed.',
    ].join('\n');
}

async function actualModel(events: unknown[]) {
    const started = events.find(e => record(e) && e.type === 'thread.started');
    const threadId = record(started) && typeof started.thread_id === 'string' ? started.thread_id : null;
    if (!threadId) return null;
    const base = path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'sessions');
    for (const offset of [0, -1, 1]) {
        const date = new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10).replaceAll('-', '/');
        const dir = path.join(base, date);
        for (const name of await readdir(dir).catch(() => [] as string[])) {
            if (!name.endsWith(`${threadId}.jsonl`)) continue;
            const content = await readFile(path.join(dir, name), 'utf8');
            for (const line of content.split('\n')) {
                if (!line) continue;
                const entry: unknown = JSON.parse(line);
                if (record(entry) && entry.type === 'turn_context' && record(entry.payload) && typeof entry.payload.model === 'string') return entry.payload.model;
            }
        }
    }
    return null;
}

async function invokeAgent(prompt: string, endpoint: string, token: string, columns: string[]) {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'dory-olist-agent-'));
    const command = process.env.DORY_EVALUATION_CODEX ?? 'codex';
    const version = spawnSync(command, ['--version'], { encoding: 'utf8' });
    if (version.status !== 0) throw new Error('Codex CLI unavailable');
    const answerPath = path.join(cwd, 'answer.json');
    const schemaPath = path.join(cwd, 'answer-schema.json');
    const textColumns = new Set(['month', 'category', 'state', 'payment_type', 'latest_order']);
    const row = {
        type: 'object',
        properties: Object.fromEntries(columns.map(c => [c, { type: [textColumns.has(c) ? 'string' : 'number', 'null'] }])),
        required: columns,
        additionalProperties: false,
    };
    await writeFile(
        schemaPath,
        JSON.stringify({
            type: 'object',
            properties: {
                workId: { type: 'string' },
                status: { type: 'string', enum: ['measured', 'unavailable'] },
                answer: { type: 'string' },
                rows: { type: 'array', items: row },
                evidenceArtifactIds: { type: 'array', items: { type: 'string' } },
                missingMetrics: { type: 'array', items: { type: 'string' } },
            },
            required: ['workId', 'status', 'answer', 'rows', 'evidenceArtifactIds', 'missingMetrics'],
            additionalProperties: false,
        }),
    );
    const args = [
        'exec',
        '--skip-git-repo-check',
        '--ignore-user-config',
        '--ignore-rules',
        '--sandbox',
        'read-only',
        '--json',
        '--output-schema',
        schemaPath,
        '--output-last-message',
        answerPath,
        '-c',
        'approval_policy="never"',
        '-c',
        `mcp_servers.dory.url=${JSON.stringify(endpoint)}`,
        '-c',
        'mcp_servers.dory.bearer_token_env_var="DORY_MCP_TOKEN"',
        '-c',
        'mcp_servers.dory.required=true',
        '-c',
        `mcp_servers.dory.enabled_tools=${JSON.stringify(tools)}`,
        '-c',
        'mcp_servers.dory.tool_timeout_sec=90',
    ];
    for (const tool of tools) args.push('-c', `mcp_servers.dory.tools.${tool}.approval_mode="approve"`);
    // Preserve the user's configured model without importing unrelated MCP servers.
    const config = await readFile(path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'config.toml'), 'utf8').catch(() => '');
    const configuredModel = process.env.DORY_EVALUATION_MODEL ?? config.match(/^model\s*=\s*"([^"]+)"/m)?.[1];
    if (configuredModel) args.push('--model', configuredModel);
    args.push('-');
    let stdout = '';
    let stderr = '';
    let exitCode: number | null;
    try {
        exitCode = await new Promise<number | null>((resolve, reject) => {
            const child = spawn(command, args, { cwd, env: { ...process.env, DORY_MCP_TOKEN: token }, stdio: ['pipe', 'pipe', 'pipe'] });
            const timeout = setTimeout(() => child.kill('SIGTERM'), Number(process.env.DORY_EVALUATION_TIMEOUT_MS ?? 240000));
            child.stdout.on('data', chunk => {
                stdout += chunk.toString();
            });
            child.stderr.on('data', chunk => {
                stderr += chunk.toString();
            });
            child.on('error', error => {
                clearTimeout(timeout);
                reject(error);
            });
            child.on('close', code => {
                clearTimeout(timeout);
                resolve(code);
            });
            child.stdin.end(prompt);
        });
        const events: unknown[] = stdout
            .trim()
            .split('\n')
            .filter(Boolean)
            .map(line => JSON.parse(line.replaceAll(token, '<redacted>')));
        // Retain tool evidence and observable messages, never private reasoning items.
        const publicEvents = events.filter(e => !(record(e) && record(e.item) && e.item.type === 'reasoning'));
        const answer: unknown = JSON.parse(await readFile(answerPath, 'utf8').catch(() => '{}'));
        return {
            events: publicEvents,
            answer,
            exitCode,
            stderr: stderr.replaceAll(token, '<redacted>').slice(-4000),
            cliVersion: version.stdout.trim(),
            actualModel: await actualModel(events),
            requestedModel: configuredModel ?? 'CLI default',
        };
    } finally {
        await rm(cwd, { recursive: true, force: true });
    }
}

async function runAgent(
    call: CallTool,
    directory: string,
    connectionId: string,
    revision: string,
    asOf: string,
    expected: Record<string, EvaluationRow[]>,
    endpoint: string,
    token: string,
    only?: string,
) {
    const results: EvaluationResult[] = [];
    for (const scenario of olistScenarios(asOf).filter(s => !only || s.id === only)) {
        let calls: ReturnType<typeof codexCalls> = [];
        let createdWorkId: string | undefined;
        try {
            const run = await invokeAgent(agentPrompt(scenario.question, connectionId, scenario.columns), endpoint, token, scenario.columns);
            const history = path.join(directory, 'attempts');
            await mkdir(history, { recursive: true });
            await copyFile(path.join(directory, `agent-${scenario.id}-trace.json`), path.join(history, `agent-${scenario.id}-${Date.now()}.json`)).catch(error => {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            });
            await writeFile(path.join(directory, `agent-${scenario.id}-trace.json`), JSON.stringify(run, null, 2));
            const createdEvent = run.events.find(e => record(e) && e.type === 'item.completed' && record(e.item) && e.item.tool === 'dory_create_work');
            if (record(createdEvent) && record(createdEvent.item)) {
                const created = toolPayload(createdEvent.item.result);
                if (typeof created.workId === 'string') createdWorkId = created.workId;
            }
            calls = codexCalls(run.events);
            if (run.exitCode !== 0) throw new Error(`Codex exited ${run.exitCode}: ${run.stderr}`);
            if (!record(run.answer)) throw new Error('Missing structured Agent answer');
            const checked = await validateAgent(call, calls, run.answer, scenario, expected[scenario.id] ?? [], connectionId, revision);
            results.push({ scenarioId: scenario.id, question: scenario.question, status: 'passed', layer: 'agent', ...checked, expectedRows: expected[scenario.id], calls });
        } catch (error) {
            const workId = createdWorkId ?? calls.find(c => c.tool === 'dory_create_work')?.output.workId;
            const message = error instanceof Error ? error.message : String(error);
            if (typeof workId === 'string')
                await call('dory_finish_work', { workId, status: 'error', findings: [], steps: [`Agent acceptance failed: ${message}`] }).catch(() => undefined);
            results.push({
                scenarioId: scenario.id,
                question: scenario.question,
                status: 'failed',
                layer: 'agent',
                workId: typeof workId === 'string' ? workId : undefined,
                error: message,
                calls,
            });
        }
        console.log(JSON.stringify({ scenario: scenario.id, status: results.at(-1)!.status, error: results.at(-1)!.error }));
    }
    return results;
}

async function main() {
    const mode = process.argv[2];
    if (mode !== 'mcp' && mode !== 'agent') throw new Error('Choose mcp or agent');
    const index = process.argv.indexOf('--output-dir');
    const directory = path.resolve(index >= 0 ? process.argv[index + 1] : path.join(appRoot, 'localdata', 'olist-evaluation'));
    const scenarioIndex = process.argv.indexOf('--scenario');
    const only = scenarioIndex >= 0 ? process.argv[scenarioIndex + 1] : undefined;
    let client: Client | undefined;
    try {
        const tokenIndex = process.argv.indexOf('--token-file');
        const token = process.env.DORY_MCP_TOKEN ?? (tokenIndex >= 0 ? (await readFile(path.resolve(process.argv[tokenIndex + 1]), 'utf8')).trim() : undefined);
        if (!token) throw new Error('Set DORY_MCP_TOKEN with schema, read-only SQL, Knowledge/assets, and Agent workspace scopes.');
        const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')) as { connectionId: string; modelRevision: string };
        const data = JSON.parse(await readFile(path.join(directory, 'data-manifest.json'), 'utf8')) as { asOf: string };
        const expected = JSON.parse(await readFile(path.join(directory, 'expected.json'), 'utf8')) as Record<string, EvaluationRow[]>;
        const fixture = await verifyOlistFixture(directory);
        const endpoint = process.env.DORY_MCP_URL ?? 'http://localhost:3000/api/mcp';
        client = new Client({ name: `olist-evaluation-${mode}`, version: '1.0.0' });
        await client.connect(new StreamableHTTPClientTransport(new URL(endpoint), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
        const activeClient = client;
        const call: CallTool = async (name, input) => toolPayload(await activeClient.callTool({ name, arguments: input }));
        const scenarios = olistScenarios(data.asOf).filter(s => !only || s.id === only);
        if (!scenarios.length) throw new Error('Unknown --scenario');
        const results =
            mode === 'mcp'
                ? await replayOlist(call, manifest.connectionId, manifest.modelRevision, scenarios, expected)
                : await runAgent(call, directory, manifest.connectionId, manifest.modelRevision, data.asOf, expected, endpoint, token, only);
        const report = await writeEvaluationReport(directory, mode, results, {
            connectionId: manifest.connectionId,
            modelRevision: manifest.modelRevision,
            asOf: data.asOf,
            endpoint,
            fixture,
        });
        if (!report.selectionOk) process.exitCode = 1;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await writeEvaluationReport(directory, mode, [{ scenarioId: 'setup', question: '', status: 'failed', layer: 'knowledge', error: message }]).catch(() => undefined);
        throw new Error(message);
    } finally {
        await client?.close();
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error('[olist:evaluation]', error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}
