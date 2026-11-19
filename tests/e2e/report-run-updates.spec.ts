import { expect } from '@playwright/test';
import { test } from './fixtures';
import { createWorkbenchConnection, mockWorkbenchApis } from './helpers/workbench';
import type { ReportUpdateItem } from '@dory/shared/types/report-updates';

test('Report uses the linked data source, hands failed SQL to AI, and updates across tabs', async ({ page }) => {
    test.setTimeout(120000);
    const connection = createWorkbenchConnection({ id: 'report-finance' }),
        unrelated = createWorkbenchConnection(),
        connectionId = connection.connection.id,
        workId = 'baidu-report-test',
        documentId = 'baidu-test';
    const sourceDatabase = 'china_data';
    const sourceSchema = 'reporting';
    const failedSql = 'SELECT year FROM missing_financials';
    const queryError = 'Catalog Error: missing_financials was not found';
    const originalSql = 'SELECT year, amount FROM financials';
    const tab = { tabId: 'baidu-metrics', tabType: 'sql', tabName: '核心财务指标', content: originalSql, connectionId, userId: 'fixture', workId };
    const tabs = new Map([[tab.tabId, tab]]);
    const sessions = new Map<string, any>();
    const content = {
        sourceWorkId: workId,
        body: '## 财务概览\n\n<DataTable source="metrics" />\n\n## 现金流分析\n\n现金流分析正文。',
        format: 'restricted-mdx',
        visuals: [{ id: 'metrics', title: '核心财务指标', type: 'table', evidenceId: 'old' }],
        evidence: [{ artifactId: 'old', title: '核心财务指标', sql: originalSql, sourceSchemaName: sourceSchema, columns: ['year', 'amount'], rows: [] }],
        knowledge: [],
    };
    let items: ReportUpdateItem[] = [],
        draftRevision = 1,
        version = 1,
        commits = 0;
    await mockWorkbenchApis(page, { initialConnections: [unrelated, connection] });
    await page.route('**/api/works/' + workId + '/events', route => route.fulfill({ json: { code: 0 } }));
    await page.route('**/api/works/' + workId + '/snapshot', route =>
        route.fulfill({ json: { code: 0, data: { snapshot: { work: { workId, title: '百度最近 3 年财报怎么样', connectionId }, tabs: [...tabs.values()], sessions: [] } } } }),
    );
    await page.route('**/api/actions/execute', route => {
        const { actionId, input } = route.request().postDataJSON(),
            reply = (data: unknown) => route.fulfill({ json: { ok: true, data } });
        switch (actionId) {
            case 'report.updates.get':
                return reply({
                    document: { id: documentId, title: '百度最近 3 年财报怎么样', content, revision: input.revision },
                    latestRevision: version,
                    userId: 'fixture',
                    baseRevision: version,
                    draftRevision,
                    items,
                    bindings: {
                        old: {
                            tabId: tab.tabId,
                            sessionId: 'original',
                            setIndex: 0,
                            sql: originalSql,
                            connectionId,
                            database: sourceDatabase,
                            resultSetId: 'old-set',
                            rowCount: 9,
                        },
                    },
                });
            case 'report.updates.save':
                items = input.items;
                return reply({ draftRevision: ++draftRevision });
            case 'report.updates.commit':
                expect(items).toHaveLength(2);
                expect(items[0].originalSql).toBe(originalSql);
                expect(items[0].results[0].rowCount).toBe(9);
                expect(items[1].originalSql).toBeNull();
                expect(items[1].results.map(result => result.setIndex)).toEqual([0, 1]);
                if (commits++ === 0) return route.fulfill({ status: 503, json: { ok: false, message: 'AI temporarily unavailable' } });
                items = [];

                return reply({ revision: ++version, publicationId: 'published-baidu' });
            case 'connection.list':
                return reply({ connections: [unrelated, connection] });
            case 'connection.get':
                return reply(input.id === connectionId ? connection : unrelated);
            case 'connection.connect':
                return reply({ connectionId, status: 'Connected' });
            case 'schema.listDatabases':
                return reply({
                    databases:
                        input.connectionId === connectionId
                            ? [
                                  { label: 'Other catalog', value: 'other' },
                                  { label: 'China data', value: sourceDatabase },
                              ]
                            : [{ label: 'Unrelated database', value: 'unrelated' }],
                });
            case 'schema.listTables':
                return reply({ tables: input.connectionId === connectionId && input.database === sourceDatabase ? [{ name: 'financials' }] : [] });
            case 'schema.listViews':
                return reply({ views: [] });
            case 'tab.list':
                return reply([...tabs.values()]);
            case 'tab.save':
                tabs.set(input.tabId, input.state);
                return reply(input.state);
            case 'query.resultSets.list':
                return reply({ resultSets: sessions.get(input.sessionId)?.queryResultSets ?? [] });
            case 'resultSet.rows.read': {
                const payload = [...sessions.values()].find(session => session.queryResultSets.some((set: { resultSetId: string }) => set.resultSetId === input.resultSetId));
                const set = payload?.queryResultSets.find((set: { resultSetId: string }) => set.resultSetId === input.resultSetId);
                const rows = payload?.results[set?.setIndex] ?? [];
                return reply({
                    resultSetId: input.resultSetId,
                    offset: input.offset ?? 0,
                    limit: input.limit,
                    rowCount: rows.length,
                    rows: rows.slice(input.offset ?? 0, (input.offset ?? 0) + (input.limit ?? rows.length)),
                    columns: set?.columns ?? [],
                    dataAvailability: 'full',
                });
            }
            case 'query.session.get':
                return reply(sessions.get(input.sessionId)?.session ?? null);
            default:
                return reply({});
        }
    });
    await page.route('**/api/sql-console/query/stream', route => {
        const { input } = route.request().postDataJSON();
        expect(input.connectionId).toBe(connectionId);
        expect(input.database).toBe(sourceDatabase);
        expect(input.schema).toBe(sourceSchema);
        const now = new Date().toISOString();
        const rows = Array.from({ length: 9 }, (_, i) => ({ year: 2023 + Math.floor(i / 3), amount: i + 1 }));
        const failed = input.sql === failedSql;
        const payload = {
            session: {
                sessionId: input.sessionId,
                tabId: input.tabId,
                connectionId,
                database: sourceDatabase,
                sqlText: input.sql,
                status: failed ? 'error' : 'success',
                errorMessage: failed ? queryError : null,
                resultSetCount: 1,
                startedAt: now,
                finishedAt: now,
            },
            queryResultSets: [
                {
                    sessionId: input.sessionId,
                    setIndex: 0,
                    resultSetId: 'rs-' + input.sessionId,
                    title: '指标',
                    sqlText: input.sql,
                    sourceDatabaseName: sourceDatabase,
                    rowCount: failed ? 0 : 9,
                    errorMessage: failed ? queryError : null,
                    dataAvailability: failed ? 'none' : 'full',
                    previewRowCount: 9,
                    columns: [
                        { name: 'year', type: 'INTEGER' },
                        { name: 'amount', type: 'INTEGER' },
                    ],
                    status: failed ? 'error' : 'success',
                },
            ],
            results: [failed ? [] : rows],
        };
        if (input.sql.includes('cash_flow')) {
            payload.session.resultSetCount = 2;
            payload.queryResultSets.push({
                ...payload.queryResultSets[0],
                sqlText: 'SELECT year, amount FROM cash_flow',
                title: '现金流',
                setIndex: 1,
                resultSetId: 'cash-' + input.sessionId,
            });
            payload.results.push(rows);
        }
        sessions.set(input.sessionId, payload);
        return route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'session-finished', payload }) + '\n' });
    });
    await page.route('**/api/copilot/action', route =>
        route.fulfill({ json: { title: 'Correct the table name', explanation: 'Use the linked table.', fixedSql: originalSql, risk: 'low' } }),
    );
    await page.goto('/');
    const org = new URL(page.url()).pathname.split('/')[1];
    const href = '/' + org + '/reports/' + documentId + '/workspace?revision=1&run=' + workId + '&connection=' + unrelated.connection.id;
    await page.goto(href);
    const panel = page.getByTestId('report-updates');
    await expect(panel.getByRole('heading', { name: 'Report updates' })).toBeVisible();
    await expect(page.getByText('China data', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Insert SELECT for financials' })).toBeVisible();
    await expect(page.getByTestId('run-query')).toBeEnabled();
    async function edit(sql: string) {
        await page.evaluate(value => window.__DORY_E2E_MONACO__!.setValue(value), sql);
    }
    await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getValue())).toBe(originalSql);
    const update = panel.getByRole('button', { name: 'AI update report' });
    await expect(update).toBeDisabled();
    await edit(failedSql);
    await page.getByTestId('run-query').click();
    const error = page.getByTestId('sql-error-alert');
    await expect(error).toContainText(queryError);
    await expect(update).toBeDisabled();
    const repairRequest = page.waitForRequest(request => request.url().endsWith('/api/copilot/action'));
    await error.getByRole('button', { name: 'AI Fix' }).click();
    const { intent, input: repairInput } = (await repairRequest).postDataJSON();
    expect(intent).toBe('fix-sql-error');
    expect(repairInput.meta.connectionId).toBe(connectionId);
    expect(repairInput.lastExecution.database).toBe(sourceDatabase);
    expect(repairInput.lastExecution.sql).toBe(failedSql);
    expect(repairInput.lastExecution.error.message).toBe(queryError);
    await page.getByRole('button', { name: 'Report updates' }).click();
    await edit(originalSql + ' ORDER BY year');
    await expect(panel.getByText('Run required')).toBeVisible();
    await expect(panel.locator('pre')).toContainText('− ' + originalSql);
    await edit(originalSql);
    await expect(panel.getByText('No SQL changes')).toBeVisible();
    await edit(originalSql + ' ORDER BY year');
    await page.getByTestId('run-query').click();
    await expect(update).toBeEnabled();
    await edit(originalSql + ' ORDER BY year DESC');
    await expect(update).toBeDisabled();
    await page.getByTestId('run-query').click();
    await expect(panel.getByText('Ran · 9 rows')).toBeVisible();
    await page.getByRole('button', { name: /Add tab/i }).click();
    await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getValue())).toBe('');
    await expect(panel.locator('section')).toHaveCount(1);
    const batchSql = 'SELECT year FROM financials; SELECT year, amount FROM cash_flow';
    await edit(batchSql);
    await expect(panel.getByText('New · Run required')).toBeVisible();
    await expect(update).toBeDisabled();
    await page.getByTestId('run-query').click();
    await expect(panel.getByText('New · Ran · 18 rows')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add to report' })).toHaveCount(0);
    await panel.locator('section button').first().click();
    await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getValue())).toBe(originalSql + ' ORDER BY year DESC');
    await page.getByRole('button', { name: 'Back to report' }).click();
    await expect(page).toHaveURL(new RegExp('/reports/' + documentId + '$'), { timeout: 45000 });
    await expect(panel).toHaveCount(0);
    await page.goto(href);
    await expect(panel.locator('section')).toHaveCount(2);
    await expect(panel.locator('pre').last()).toContainText('+ ' + batchSql);
    await update.click();
    await expect(panel.getByRole('alert')).toContainText('AI temporarily unavailable');
    await expect(panel.locator('section')).toHaveCount(2);
    await update.click();
    await expect.poll(() => commits).toBe(2);
    await expect(panel.getByRole('link', { name: 'View report' })).toHaveAttribute('href', /published-baidu/);
    await page.goto(href + '&history=1');
    await expect(panel.getByText('You are viewing a previous version.')).toBeVisible();
    await expect(update).toBeDisabled();
    await panel.getByRole('button', { name: 'Switch to the latest version' }).click();
    await expect(page).toHaveURL(/revision=2/);
    await expect(panel.getByText('You are viewing a previous version.')).toHaveCount(0);
});
