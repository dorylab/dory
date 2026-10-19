import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import Database from 'better-sqlite3';
import { ossieRevision, parseKnowledgeYaml, parseOssieYaml, serializeOssieDocument } from '@dory/database/postgres/impl/knowledge';
import { OSSIE_VERSION } from '@dory/shared/types/ossie';

import { assertEvaluationRows, buildOlistOssieDocument, olistScenarios, type EvaluationRow } from '@/lib/demo/olist-evaluation';
import { agentPrompt } from '../olist-evaluation-run';
import { codexCalls, replayOlist, validateAgent, writeEvaluationReport, type JsonRecord, type ToolCall } from '../olist/evaluation';
import { verifyOlistFixture } from '../olist/fixture';

const prepareScript = path.resolve('scripts/olist/prepare.py');

test('Olist model passes official Ossie schema, preserves bindings and has no invented refund or profit fields', () => {
    const yaml = serializeOssieDocument(buildOlistOssieDocument('conn-olist', { min: '2016-09-04', max: '2018-10-17' }));
    const doc = parseOssieYaml(yaml);
    const projection = parseKnowledgeYaml(yaml, 'conn-olist', false);
    assert.equal(doc.version, OSSIE_VERSION);
    assert.equal(doc.datasets.length, 9);
    assert.equal(doc.metrics?.length, 8);
    assert.equal(doc.relationships?.length, 7);
    assert.ok(projection.definitions.every(d => d.status === 'verified' && d.sourceConnectionId === 'conn-olist'));
    assert.equal(ossieRevision(doc), ossieRevision(parseOssieYaml(serializeOssieDocument(doc))));
    assert.ok(!doc.metrics?.some(m => ['refund_rate', 'net_profit', 'payment_success_rate'].includes(m.name)));
});

test('CSV oracle and SQL agree on fanout, missing items, multi-payment, moving customers and same-day delivery', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'olist-test-'));
    try {
        const fixture = {
            orders: [
                {
                    order_id: 'o1',
                    customer_id: 'c1',
                    order_status: 'delivered',
                    order_purchase_timestamp: '2018-08-01 09:00:00',
                    order_delivered_customer_date: '2018-08-03 20:00:00',
                    order_estimated_delivery_date: '2018-08-03 00:00:00',
                },
                {
                    order_id: 'o2',
                    customer_id: 'c2',
                    order_status: 'delivered',
                    order_purchase_timestamp: '2018-08-02 09:00:00',
                    order_delivered_customer_date: '2018-08-05 00:00:00',
                    order_estimated_delivery_date: '2018-08-03 00:00:00',
                },
                { order_id: 'o3', customer_id: 'c3', order_status: 'canceled', order_purchase_timestamp: '2018-08-03 09:00:00' },
                { order_id: 'o4', customer_id: 'c4', order_status: 'delivered', order_purchase_timestamp: '2018-08-04 09:00:00' },
            ],
            customers: [
                { customer_id: 'c1', customer_unique_id: 'u1', customer_state: 'SP' },
                { customer_id: 'c2', customer_unique_id: 'u1', customer_state: 'RJ' },
                { customer_id: 'c3', customer_unique_id: 'u2', customer_state: 'SP' },
                { customer_id: 'c4', customer_unique_id: 'u3', customer_state: 'RJ' },
            ],
            products: [{ product_id: 'p1', product_category_name: 'toy' }, { product_id: 'p2' }],
            sellers: [{ seller_id: 's1' }],
            order_items: [
                { order_id: 'o1', order_item_id: '1', product_id: 'p1', seller_id: 's1', price: '1.01', freight_value: '9.00' },
                { order_id: 'o1', order_item_id: '2', product_id: 'p2', seller_id: 's1', price: '2.02', freight_value: '3.00' },
                { order_id: 'o2', order_item_id: '1', product_id: 'p1', seller_id: 's1', price: '4.04', freight_value: '1.00' },
                { order_id: 'o3', order_item_id: '1', product_id: 'p1', seller_id: 's1', price: '99.99', freight_value: '0.00' },
            ],
            payments: [
                { order_id: 'o1', payment_sequential: '1', payment_type: 'voucher', payment_value: '1.00' },
                { order_id: 'o1', payment_sequential: '2', payment_type: 'card', payment_value: '14.03' },
                { order_id: 'o2', payment_sequential: '1', payment_type: 'card', payment_value: '5.04' },
            ],
            reviews: [
                { review_id: 'r1', order_id: 'o1', review_comment_message: 'quoted "text",\nsecond line' },
                { review_id: 'r1', order_id: 'o2' },
            ],
            category_translation: [{ product_category_name: 'toy', product_category_name_english: 'toys' }],
            geolocation: [{ geolocation_zip_code_prefix: '1' }, { geolocation_zip_code_prefix: '1' }],
        };
        const makeFixture = `import csv,importlib.util,json,sys\nfrom pathlib import Path\ns=importlib.util.spec_from_file_location('prepare',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nd=Path(sys.argv[2]);data=json.load(sys.stdin)\nfor t,(f,fields,_) in m.FILES.items():\n with (d/f).open('w',newline='',encoding='utf-8') as out:\n  w=csv.DictWriter(out,fieldnames=fields.split());w.writeheader();w.writerows(data[t])\n`;
        const made = spawnSync('python3', ['-c', makeFixture, prepareScript, dir], { input: JSON.stringify(fixture), encoding: 'utf8' });
        assert.equal(made.status, 0, made.stderr);
        const prepared = spawnSync('python3', [prepareScript, '--input-dir', dir, '--output-dir', dir, '--as-of', '2026-10-15'], { encoding: 'utf8' });
        assert.equal(prepared.status, 0, prepared.stderr);
        const expected = JSON.parse(await readFile(path.join(dir, 'expected.json'), 'utf8')) as Record<string, EvaluationRow[]>;
        await verifyOlistFixture(dir);
        const db = new Database(path.join(dir, 'olist.sqlite'), { readonly: true });
        try {
            for (const s of olistScenarios('2026-10-15').filter(s => !s.unavailable)) assertEvaluationRows(db.prepare(s.sql).all(), expected[s.id]);
            assert.equal(expected.monthly[0].merchandise_cents, 707);
            assert.equal(expected.monthly[0].order_count, 3);
            assert.equal(expected.delivery[0].late_rate, 0.5);
            assert.equal((db.prepare('SELECT COUNT(*) n FROM reviews').get() as { n: number }).n, 2);
            assert.equal((db.prepare('SELECT COUNT(*) n FROM geolocation').get() as { n: number }).n, 2);
            assert.equal((db.prepare('SELECT review_comment_message value FROM reviews WHERE source_row=1').get() as { value: string }).value, 'quoted "text",\nsecond line');
        } finally {
            db.close();
        }
        // Invalid primary keys fail rather than quietly changing the independent oracle.
        fixture.orders.push(fixture.orders[0]);
        spawnSync('python3', ['-c', makeFixture, prepareScript, dir], { input: JSON.stringify(fixture) });
        const bad = spawnSync('python3', [prepareScript, '--input-dir', dir, '--output-dir', dir, '--as-of', '2026-10-15'], { encoding: 'utf8' });
        assert.notEqual(bad.status, 0);
        const preserved = new Database(path.join(dir, 'olist.sqlite'), { readonly: true });
        assert.equal((preserved.prepare('SELECT COUNT(*) n FROM orders').get() as { n: number }).n, 4);
        preserved.close();
        await verifyOlistFixture(dir); // Failed prepare did not replace successful provenance.
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('row comparisons reject lossy amount, missing columns, wrong denominator and invalid numerics', () => {
    const expected = [{ state: 'SP', merchandise_cents: 101, repeat_rate: 0.5 }];
    assertEvaluationRows([{ state: 'SP', merchandise_cents: '101', repeat_rate: '0.5000000' }], expected);
    for (const row of [
        { state: 'SP', merchandise_cents: 101.1, repeat_rate: 0.5 },
        { state: 'SP', merchandise_cents: 101, repeat_rate: 50 },
        { state: 'SP', merchandise_cents: '', repeat_rate: 0.5 },
        { state: 'SP', repeat_rate: 0.5 },
    ])
        assert.throws(() => assertEvaluationRows([row], expected));
    assert.throws(() => olistScenarios('2026-02-30'));
});

test('Agent prompt excludes reference SQL/answers and trace rejects shell or alternate data sources', () => {
    const scenario = olistScenarios('2026-10-15')[0];
    const prompt = agentPrompt(scenario.question, 'conn', scenario.columns);
    assert.ok(!prompt.includes(scenario.sql));
    assert.ok(!prompt.includes('expected.json'));
    assert.throws(() => codexCalls([{ type: 'item.completed', item: { type: 'command_execution' } }]));
    assert.throws(() => codexCalls([{ type: 'item.completed', item: { type: 'mcp_tool_call', server: 'other', status: 'completed' } }]));
});

function measuredCalls(): ToolCall[] {
    const scenario = olistScenarios('2026-10-15')[0];
    return [
        {
            tool: 'dory_create_work',
            input: { connectionId: 'conn', userQuestion: scenario.question },
            output: {
                workId: 'run',
                semanticContext: scenario.semanticNames.join(' '),
                semanticModelsUsed: [
                    { name: 'Olist Commerce Knowledge', ossieVersion: OSSIE_VERSION, modelRevision: 'revision', metricNames: scenario.semanticNames, relationshipNames: [] },
                ],
            },
        },
        { tool: 'dory_search_assets', input: { workId: 'run' }, output: {} },
        { tool: 'dory_read_asset', input: { workId: 'run' }, output: {} },
        { tool: 'dory_explore_schema', input: { workId: 'run' }, output: {} },
        {
            tool: 'dory_run_readonly_sql',
            input: { workId: 'run', connectionId: 'conn', sql: 'SELECT ...' },
            output: { result: [{ month: '2018-01', merchandise_cents: 101, order_count: 1, aov_cents: 101 }], truncated: false, artifacts: [{ artifactId: 'artifact' }] },
        },
        { tool: 'dory_finish_work', input: { workId: 'run', status: 'completed', findings: [{ title: 'measured', evidenceArtifactIds: ['artifact'] }] }, output: {} },
    ];
}

test('Agent acceptance uses actual executed evidence, rejects self-reported answers and uncited Findings', async () => {
    const calls = measuredCalls();
    const rows = calls[4].output.result as EvaluationRow[];
    const answer = { workId: 'run', status: 'measured', rows, evidenceArtifactIds: ['artifact'] };
    const read = async () => ({ artifact: { workId: 'run' }, preview: { rows, limited: false } });
    const scenario = olistScenarios('2026-10-15')[0];
    await validateAgent(read, calls, answer, scenario, rows, 'conn', 'revision');
    await assert.rejects(() => validateAgent(read, calls, { ...answer, rows: [{ ...rows[0], order_count: 2 }] }, scenario, rows, 'conn', 'revision'));
    await assert.rejects(() =>
        validateAgent(async () => ({ artifact: { workId: 'other' }, preview: { rows, limited: false } }), calls, answer, scenario, rows, 'conn', 'revision'),
    );
    await assert.rejects(() => validateAgent(read, calls, answer, scenario, rows, 'conn', 'different-revision'));
    calls[5].input.findings = [];
    await assert.rejects(() => validateAgent(read, calls, answer, scenario, rows, 'conn', 'revision'));
});

test('unavailable metrics require empty Findings and reasons for each missing input', async () => {
    const calls = measuredCalls().filter(c => c.tool !== 'dory_run_readonly_sql');
    const scenario = olistScenarios('2026-10-15').at(-1)!;
    calls[0].input.userQuestion = scenario.question;
    calls.at(-1)!.input.findings = [];
    const answer = {
        workId: 'run',
        status: 'unavailable',
        rows: [],
        missingMetrics: ['refund_rate', 'net_profit', 'payment_success_rate'],
        answer: '缺少退款金额、成本和支付尝试结果。',
    };
    await validateAgent(async () => ({}), calls, answer, scenario, [], 'conn', 'revision');
    calls.at(-1)!.input.findings = [{ title: 'invented refund rate' }];
    await assert.rejects(() => validateAgent(async () => ({}), calls, answer, scenario, [], 'conn', 'revision'));
});

test('multi-statement diagnostic Artifacts use their own read-back rows and never become Findings', async () => {
    const calls = measuredCalls().filter(c => c.tool !== 'dory_run_readonly_sql');
    const scenario = olistScenarios('2026-10-15').at(-1)!;
    calls[0].input.userQuestion = scenario.question;
    calls.at(-1)!.input.findings = [];
    const laterRows = [{ latest_order: '2018-10-17 17:30:18' }];
    calls.splice(
        calls.length - 1,
        0,
        {
            tool: 'dory_run_readonly_sql',
            input: { workId: 'run', connectionId: 'conn', sql: 'SELECT tables; SELECT latest;' },
            output: { result: [{ table_name: 'orders' }, { table_name: 'payments' }], truncated: false, artifacts: [{ artifactId: 'schema' }, { artifactId: 'time' }] },
        },
        { tool: 'dory_artifacts', input: { workId: 'run', artifactId: 'time' }, output: { artifact: { workId: 'run' }, preview: { rows: laterRows, limited: false } } },
    );
    const answer = {
        workId: 'run',
        status: 'unavailable',
        rows: [],
        evidenceArtifactIds: ['time'],
        missingMetrics: ['refund_rate', 'net_profit', 'payment_success_rate'],
        answer: '缺少退款金额、成本和支付尝试结果。',
    };
    const read = async () => ({ artifact: { workId: 'run' }, preview: { rows: laterRows, limited: false } });
    const result = await validateAgent(read, calls, answer, scenario, [], 'conn', 'revision');
    assert.deepEqual(result.evidenceArtifactIds, []);
    assert.deepEqual(result.inspectionArtifactIds, ['time']);
    assert.deepEqual(result.sql, ['SELECT tables; SELECT latest;']);
    await assert.rejects(() =>
        validateAgent(async () => ({ artifact: { workId: 'run' }, preview: { rows: [], limited: false } }), calls, answer, scenario, [], 'conn', 'revision'),
    );
});

test('a passing single scenario cannot mark the full acceptance suite passed', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'olist-report-'));
    try {
        const result = await writeEvaluationReport(dir, 'agent', [{ scenarioId: 'monthly', question: 'test', status: 'passed', layer: 'agent' }]);
        assert.equal(result.selectionOk, true);
        assert.equal(result.complete, false);
        assert.equal(result.ok, false);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('MCP replay reports the actual failing layer and marks its Run error', async () => {
    const finished: JsonRecord[] = [];
    const scenario = olistScenarios('2026-10-15')[0];
    const call = async (tool: string, input: JsonRecord) => {
        if (tool === 'dory_create_work') return measuredCalls()[0].output;
        if (tool === 'dory_search_assets') return { assets: [{ ref: 'dory://knowledge/example' }] };
        if (tool === 'dory_run_readonly_sql') return { result: [], truncated: false };
        if (tool === 'dory_finish_work') finished.push(input);
        return {};
    };
    const result = await replayOlist(call, 'conn', 'revision', [scenario], { monthly: [{ month: '2018-01', merchandise_cents: 101, order_count: 1, aov_cents: 101 }] });
    assert.equal(result[0].status, 'failed');
    assert.equal(result[0].layer, 'sql');
    assert.equal(finished[0].status, 'error');
    assert.deepEqual(finished[0].findings, []);
});

test('official locally prepared data matches every independent CSV benchmark', { skip: !process.env.DORY_OLIST_DATA_DIR }, async () => {
    const dir = process.env.DORY_OLIST_DATA_DIR!;
    const expected = JSON.parse(await readFile(path.join(dir, 'expected.json'), 'utf8')) as Record<string, EvaluationRow[]>;
    const manifest = JSON.parse(await readFile(path.join(dir, 'data-manifest.json'), 'utf8')) as { asOf: string };
    const db = new Database(path.join(dir, 'olist.sqlite'), { readonly: true });
    try {
        for (const s of olistScenarios(manifest.asOf).filter(s => !s.unavailable)) assertEvaluationRows(db.prepare(s.sql).all(), expected[s.id]);
    } finally {
        db.close();
    }
});
