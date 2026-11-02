import { expect } from '@playwright/test';
import type { QueryExecutePayload } from '../../apps/web/lib/client/sql-console-query-stream';
import type { UITabPayload } from '@dory/shared/types/tabs';
import { test, expectAppHealthy } from './fixtures';
import { createWorkbenchConnection, mockWorkbenchApis } from './helpers/workbench';

test('Agent Run shares the query UI while retaining tabs, charts, cancellation and save-and-close', async ({ page, appErrors }, testInfo) => {
    test.setTimeout(180_000);
    const connection = createWorkbenchConnection();
    const workId = 'shared-workspace-run';
    const initialTab: UITabPayload = {
        tabId: 'generated-query',
        tabType: 'sql',
        tabName: 'Category totals',
        content: 'SELECT category, value FROM totals',
        userId: 'fixture',
        connectionId: connection.connection.id,
        workId,
    };
    const sessions = new Map<string, QueryExecutePayload>();
    const tabs = new Map<string, UITabPayload>([[initialTab.tabId, initialTab]]);
    let hold = false;
    let release: (() => void) | undefined;
    let canceled = 0;
    let executions = 0;
    let saves = 0;
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await page.addInitScript(() => localStorage.setItem('agent-runs.workspace-tour.dismissed.v1', '1'));
    await page.route(`**/api/works/${workId}/snapshot`, route =>
        route.fulfill({
            json: { code: 0, data: { snapshot: { work: { workId, title: 'Category analysis', connectionId: connection.connection.id }, tabs: [...tabs.values()], sessions: [] } } },
        }),
    );
    await page.route(`**/api/works/${workId}/events`, async route => {
        saves++;
        await route.fulfill({ json: { code: 0 } });
    });
    await page.route('**/api/actions/execute', async route => {
        const { actionId, input } = route.request().postDataJSON();
        const fulfill = (data: unknown) => route.fulfill({ json: { ok: true, data } });
        switch (actionId) {
            case 'connection.list':
                return fulfill({ connections: [connection] });
            case 'connection.get':
                return fulfill(connection);
            case 'connection.connect':
                return fulfill({ connectionId: connection.connection.id, status: 'Connected' });
            case 'schema.listDatabases':
                return fulfill({ databases: [{ label: 'main', value: 'main' }] });
            case 'schema.listSchemas':
                return fulfill([]);
            case 'schema.listTables':
                return fulfill({ tables: [] });
            case 'schema.listViews':
                return fulfill({ views: [] });
            case 'schema.listMaterializedViews':
                return fulfill({ materializedViews: [] });
            case 'schema.listFunctions':
                return fulfill({ functions: [] });
            case 'tab.list':
                return fulfill([...tabs.values()]);
            case 'tab.save':
                expect(input.workId).toBe(workId);
                tabs.set(input.tabId, input.state);
                return fulfill(input.state);
            case 'tab.delete':
                tabs.delete(input.tabId);
                return fulfill({});
            case 'query.resultSets.list':
                return fulfill({ resultSets: sessions.get(input.sessionId)?.queryResultSets ?? [] });
            case 'query.session.get':
                return fulfill(sessions.get(input.sessionId)?.session ?? null);
            case 'query.cancel':
                canceled++;
                return fulfill({});
            default:
                return fulfill({});
        }
    });
    await page.route('**/api/sql-console/query/stream', async route => {
        const { input } = route.request().postDataJSON();
        executions++;
        if (hold) {
            await new Promise<void>(resolve => {
                release = resolve;
            });
            await route.abort().catch(() => undefined);
            return;
        }
        const now = new Date().toISOString();
        const payload: QueryExecutePayload = {
            session: {
                sessionId: input.sessionId,
                tabId: input.tabId,
                connectionId: connection.connection.id,
                database: 'main',
                sqlText: input.sql,
                status: 'success',
                startedAt: now,
                finishedAt: now,
                durationMs: 5,
                resultSetCount: 1,
            },
            queryResultSets: [
                {
                    sessionId: input.sessionId,
                    setIndex: 0,
                    resultSetId: `result-${input.sessionId}`,
                    dataAvailability: 'full',
                    previewRowCount: 2,
                    title: 'Category totals',
                    sqlText: input.sql,
                    columns: [
                        { name: 'category', type: 'TEXT' },
                        { name: 'value', type: 'INTEGER' },
                    ],
                    rowCount: 2,
                    status: 'success',
                    startedAt: now,
                    finishedAt: now,
                    durationMs: 5,
                },
            ],
            results: [
                [
                    { category: 'Alpha', value: 11 },
                    { category: 'Beta', value: 22 },
                ],
            ],
        };
        sessions.set(input.sessionId, payload);
        await route.fulfill({ contentType: 'application/x-ndjson', body: `${JSON.stringify({ type: 'session-finished', payload })}\n` });
    });
    await page.goto('/');
    const organization = new URL(page.url()).pathname.split('/')[1];
    await page.goto(`/${organization}/agent-runs/${workId}/workspace/${connection.connection.id}`);
    await expect(page.getByTestId('run-query')).toBeEnabled();
    await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getValue())).toBe(initialTab.content);
    expect(executions).toBe(0);
    await expect(page.getByTestId('sql-source-sidebar').getByRole('textbox', { name: 'Filter tables' })).toBeVisible();
    await expect(page.getByTestId('sql-workspace-panel').getByRole('button', { name: 'Workspace actions' })).toBeVisible();
    const editorPanel = page.locator('[data-panel][id="editor-panel"]');
    const before = (await editorPanel.boundingBox())!;
    await page.mouse.move(before.x + before.width / 2, before.y + before.height + 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2, before.y + before.height + 82, { steps: 10 });
    await page.mouse.up();
    await expect.poll(async () => (await editorPanel.boundingBox())!.height).toBeGreaterThan(before.height + 30);
    await page.getByTestId('run-query').click();
    const results = page.getByTestId('result-table').filter({ visible: true });
    await expect(results.getByRole('button', { name: 'Alpha', exact: true })).toBeVisible();
    await results.getByRole('tab', { name: 'Charts', exact: true }).click();
    await expect(results.locator('.recharts-wrapper')).toBeVisible();
    await results.getByRole('tab', { name: 'Table', exact: true }).click();
    const generatedTab = page.getByRole('tab', { name: /^Category totals/ });
    await page.getByRole('button', { name: /Add tab/i }).click();
    await expect(generatedTab).toHaveAttribute('aria-selected', 'false');
    await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getValue())).toBe('');
    await generatedTab.click();
    await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getValue())).toBe(initialTab.content);
    await expect(results.getByRole('button', { name: 'Alpha', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close Agent Run panel', exact: true }).click();
    await expect(page.getByText('Continue with external Agent', { exact: true })).toBeHidden();
    await page.getByRole('button', { name: 'Open Agent Run panel', exact: true }).click();
    await expect(page.getByText('Continue with external Agent', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('agent-shared-workspace.png'), fullPage: true });
    hold = true;
    await page.getByTestId('run-query').click();
    await expect.poll(() => Boolean(release)).toBe(true);
    await page.getByTestId('sql-query-toolbar').getByRole('button', { name: 'Stop', exact: true }).click();
    release?.();
    await expect.poll(() => canceled).toBe(1);
    await expect(page.getByTestId('run-query')).toBeEnabled();
    await page.evaluate(() => window.__DORY_E2E_MONACO__!.setValue('SELECT 33 AS value'));
    await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getValue())).toBe('SELECT 33 AS value');
    await page.getByRole('button', { name: 'Workspace actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Close workspace', exact: true }).click();
    await page.getByRole('button', { name: 'Save and close', exact: true }).click();
    await expect(page.getByTestId('sql-workspace')).toBeHidden();
    expect(tabs.get(initialTab.tabId)?.content).toBe('SELECT 33 AS value');
    expect(saves).toBe(1);
    expect(executions).toBe(2);
    await expectAppHealthy(appErrors);
});
