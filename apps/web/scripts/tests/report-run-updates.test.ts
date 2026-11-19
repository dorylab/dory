import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReportResultPointer, ReportUpdateItem } from '@dory/shared/types/report-updates';
import { reportRetentionFixture } from '../../../../packages/database/scripts/tests/report-retention-fixture';
import { createReportUpdateActions } from '@/lib/actions/server/domains/report/updates';
import { canvasBlocks } from '@/lib/work-documents/report-canvas';
import { updateReady } from '@/lib/work-documents/report-updates';

test('AI report update verifies complete runs, updates references and prose atomically, and skips unrelated results', async () => {
    const f = await reportRetentionFixture();
    const owner = { organizationId: 'org', userId: 'alice' },
        connectionId = 'sec',
        workId = 'baidu';
    const sqlByTab = new Map<string, string>();
    let aiCalls = 0;
    const reportUpdateActions = createReportUpdateActions(async ({ results, content }) => {
        aiCalls++;
        if (aiCalls === 1) throw new Error('AI unavailable');
        const linked = results.find(entry => entry.replaces.length);
        if (!linked) return { edits: [], insertions: [], reason: 'Unrelated to financials' };
        const blocks = canvasBlocks(content);
        const cash = results.find(entry => entry.evidence.sql?.includes('from cash_flow'))!;
        return {
            edits: [
                {
                    blockId: blocks.find(b => b.source.includes('经营现金流需要'))!.id,
                    text: '2025 经营现金流为 -30。 [依据](dory://evidence-group/quality)',
                    artifactIds: [cash.evidence.artifactId],
                },
            ],
            insertions: [{ artifactId: cash.evidence.artifactId, sectionId: blocks.find(b => b.title === '现金流分析')!.id, title: '经营现金流' }],
            reason: '',
        };
    });
    const context = {
        ...owner,
        access: { permissions: { connection: { read: true } } },
        services: {
            db: {
                workDocuments: f.reports,
                artifacts: f.catalog,
                resultSets: f.results,
                works: { getById: async () => ({ workId }) },
                connections: { getById: async () => ({}) },
                tabState: { loadTabState: async (id: string) => ({ content: sqlByTab.get(id) }) },
            },
        },
    };
    async function action(id: string, input: unknown): Promise<any> {
        const a = reportUpdateActions.find(action => action.id === 'report.updates.' + id)!;
        return a.handler(context as never, a.inputSchema.parse(input) as never);
    }
    async function run(tabId: string, sessionId: string, setIndex: number, sql: string, rows: { year: number; amount: number }[], batchSql = sql): Promise<ReportResultPointer> {
        sqlByTab.set(tabId, batchSql);
        const result = await f.results.persistQueryResultSet({
            workId,
            ...owner,
            connectionId,
            tabId,
            sessionId,
            sourceDatabaseName: 'sec_financials',
            sessionSqlText: batchSql,
            rows,
            resultSet: {
                sessionId,
                setIndex,
                sqlText: sql,
                status: 'success',
                rowCount: rows.length,
                columns: [
                    { name: 'year', type: 'Int64' },
                    { name: 'amount', type: 'Int64' },
                ],
            },
        });
        return { connectionId, tabId, sessionId, setIndex, resultSetId: result.resultSetId, sql, database: 'sec_financials', rowCount: rows.length };
    }
    try {
        const old = await run('metrics', 'metrics-original', 0, 'select year, amount from financials', [{ year: 2023, amount: 1 }]);
        const id = 'artifact_' + old.resultSetId;
        const profit = await f.seedEvidence('profit-reference');
        const report = await f.reports.create({
            ...owner,
            creationKey: 'baidu-test',
            scope: { connectionIds: [connectionId] },
            title: '百度最近 3 年财报怎么样',
            content: {
                sourceWorkId: workId,
                markdown:
                    '## 财务概览\n\n![核心财务指标](dory://visual/core)\n\n## 现金流分析\n\n经营现金流需要结合利润变化解读。 [依据](dory://evidence-group/quality)\n\n![对照表](dory://visual/copy)',
                visuals: [
                    { id: 'core', title: '核心财务指标', type: 'table', evidenceId: id },
                    {
                        id: 'copy',
                        title: '对照表',
                        type: 'chart',
                        evidenceId: id,
                        chartSpec: { version: 1, chartType: 'line', xKey: 'year', yKey: 'sum:amount', groupKey: '__none__' },
                    },
                ],
                knowledge: [],
                evidenceGroups: [{ id: 'quality', references: [{ artifactId: 'profit-reference' }, { artifactId: id }] }],
                evidence: [
                    profit,
                    {
                        artifactId: id,
                        title: '核心指标',
                        connectionId,
                        connectionName: 'SEC',
                        sourceDatabaseName: old.database,
                        sourceSchemaName: 'reporting',
                        runId: workId,
                        sql: old.sql,
                        rows: [{ year: 2023, amount: 1 }],
                        rowCount: 1,
                        columns: ['year', 'amount'],
                        truncated: false,
                        capturedAt: new Date().toISOString(),
                    },
                ],
            },
        });
        const key = { ...owner, documentId: report.id, workId, revision: report.revision },
            initial = await action('get', key);
        assert.equal(initial.bindings[id].sessionId, old.sessionId);

        const result = await run(
            'metrics',
            'metrics-updated',
            0,
            old.sql + ' order by year',
            Array.from({ length: 9 }, (_, i) => ({ year: 2023 + Math.floor(i / 3), amount: i })),
        );
        const cashSql = 'select year, amount from cash_flow';
        const batchSql = 'select 1; ' + cashSql;
        const exploratory = await run('cash', 'cash-updated', 0, 'select 1', [], batchSql);
        const cash = await run(
            'cash',
            'cash-updated',
            1,
            cashSql,
            [
                { year: 2023, amount: 366 },
                { year: 2024, amount: 212 },
                { year: 2025, amount: -30 },
            ],
            batchSql,
        );
        function item(result: ReportResultPointer, title: string, originalSql: string | null): ReportUpdateItem {
            return { id: crypto.randomUUID(), tabId: result.tabId, sourceTabId: result.tabId, title, sql: result.sql, originalSql, executedSql: result.sql, results: [result] };
        }
        const core = item(result, 'Metrics', old.sql),
            line = { ...item(cash, 'Cash flow', null), sql: batchSql, executedSql: batchSql, results: [exploratory, cash] };
        assert.equal(updateReady({ ...core, sql: 'select 0' }), false);
        let edit = { ...key, baseRevision: initial.baseRevision, expectedDraftRevision: initial.draftRevision };
        async function save(items: ReportUpdateItem[]) {
            const saved = await action('save', { ...edit, items });
            edit.expectedDraftRevision = saved.draftRevision;
        }
        const commit = () => action('commit', { ...edit, requestId: crypto.randomUUID() });
        await assert.rejects(save([{ ...core, results: [{ ...result, sessionId: 'wrong-session' }] }]), /workspace/);
        await save([core, { ...line, results: [] }]);
        await assert.rejects(commit(), /every changed SQL tab/);
        await save([core, { ...line, results: [cash] }]);
        await assert.rejects(commit(), /complete SQL tab/);
        await save([core, line]);
        sqlByTab.set(core.tabId, 'select 0');
        await assert.rejects(commit(), /saved tab SQL changed/);
        sqlByTab.set(core.tabId, core.sql);
        await assert.rejects(commit(), /AI unavailable/);
        assert.equal((await f.reports.get(key)).revision, key.revision);
        const request = { ...edit, requestId: crypto.randomUUID() };
        const published = await action('commit', request);
        assert.deepEqual(await action('commit', request), published);
        assert.equal(aiCalls, 2);
        const latest = await action('get', { ...key, revision: published.revision });
        assert.equal(latest.items.length, 0);
        const content = latest.document.content;
        const updatedId = 'artifact_' + result.resultSetId;
        assert.equal(content.visuals.find((v: any) => v.id === 'copy').evidenceId, updatedId);
        assert.ok(content.visuals.find((v: any) => v.id === 'copy').chartData);
        assert.ok(!content.evidence.some((e: any) => e.artifactId === 'artifact_' + exploratory.resultSetId));
        assert.equal(content.visuals.find((v: any) => v.id === 'core').evidenceId, updatedId);
        assert.equal(content.evidence.find((e: any) => e.sql === result.sql).rows.length, 9);
        assert.equal(content.evidence.find((e: any) => e.sql === result.sql).sourceSchemaName, 'reporting');
        assert.deepEqual(
            content.evidenceGroups[0].references.map((r: any) => r.artifactId),
            ['profit-reference', updatedId],
        );
        assert.ok(content.body.includes('2025 经营现金流为 -30。'));
        assert.ok(content.body.includes('dory://evidence/artifact_' + cash.resultSetId));
        assert.equal(content.visuals.find((v: any) => v.title === '经营现金流').evidenceId, 'artifact_' + cash.resultSetId);
        assert.equal((await action('get', key)).draftRevision, 0);
        await assert.rejects(save([]), /changed/);
        const other = item(await run('other', 'other-session', 0, 'select 3', []), 'Unrelated', null);
        edit = { ...key, revision: published.revision, baseRevision: latest.baseRevision, expectedDraftRevision: latest.draftRevision };
        await save([other]);
        const renamed = await f.reports.rename({ ...key, title: '另一个标题', expectedRevision: published.revision });
        await assert.rejects(commit(), /changed/);
        const recovered = await action('get', { ...key, revision: renamed.revision });
        assert.equal(recovered.items[0].sql, other.sql);
        assert.equal(updateReady(recovered.items[0]), false);
        edit = { ...key, revision: renamed.revision, baseRevision: recovered.baseRevision, expectedDraftRevision: recovered.draftRevision };
        await save([other]);
        const skipped = await commit();
        assert.equal(skipped.unchanged, true);
        assert.equal(skipped.reason, 'Unrelated to financials');
        assert.equal((await f.reports.get(key)).revision, renamed.revision);
    } finally {
        await f.close();
    }
});
