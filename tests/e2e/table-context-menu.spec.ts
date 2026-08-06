import { expect, type Page, type Route } from '@playwright/test';

import { expectAppHealthy, test } from './fixtures';
import { createWorkbenchConnection, mockWorkbenchApis, openMockConnectionConsole } from './helpers/workbench';

const connection = createWorkbenchConnection();
const expectedMenuItems = ['New Query', 'Quick Query', 'Copy', 'Rename', 'Import Data'];

test.describe.configure({ mode: 'serial' });

async function fulfillAction(route: Route, data: unknown) {
    await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
            ok: true,
            data,
            execution: { id: 'e2e-action' },
        }),
    });
}

async function mockTableActions(page: Page) {
    await page.route('**/api/sql-console/query/stream', async route => {
        const request = route.request().postDataJSON() as {
            input?: { sql?: string; database?: string; sessionId?: string; tabId?: string };
            currentConnectionId?: string;
        };
        const now = new Date().toISOString();
        const sessionId = request.input?.sessionId ?? 'quick-query-session';
        const payload = {
            session: {
                sessionId,
                tabId: request.input?.tabId ?? null,
                connectionId: request.currentConnectionId ?? null,
                database: request.input?.database ?? null,
                sqlText: request.input?.sql ?? '',
                status: 'success',
                errorMessage: null,
                startedAt: now,
                finishedAt: now,
                durationMs: 1,
                resultSetCount: 0,
                stopOnError: false,
                source: 'sql-console',
            },
            queryResultSets: [],
            results: [],
            meta: { totalSets: 0 },
        };

        await route.fulfill({
            status: 200,
            contentType: 'application/x-ndjson',
            body: `${JSON.stringify({ type: 'session-started', payload })}\n${JSON.stringify({ type: 'session-finished', payload })}\n`,
        });
    });

    await page.route('**/api/actions/execute', async route => {
        const payload = route.request().postDataJSON() as { actionId?: string; input?: Record<string, unknown> };
        switch (payload.actionId) {
            case 'connection.list':
                await fulfillAction(route, { connections: [connection] });
                return;
            case 'connection.get':
                await fulfillAction(route, connection);
                return;
            case 'connection.connect':
                await fulfillAction(route, {
                    connectionId: connection.connection.id,
                    identityId: connection.identities[0]?.id ?? null,
                    status: 'Connected',
                });
                return;
            case 'schema.listDatabases':
                await fulfillAction(route, { databases: [{ label: 'demo', value: 'demo' }] });
                return;
            case 'schema.listSchemas':
                await fulfillAction(route, [{ label: 'default', value: 'default' }]);
                return;
            case 'schema.listTables':
                await fulfillAction(route, { tables: [{ label: 'numbers', value: 'default.numbers', schema: 'default' }] });
                return;
            case 'schema.listViews':
                await fulfillAction(route, { views: [] });
                return;
            case 'schema.listMaterializedViews':
                await fulfillAction(route, { materializedViews: [] });
                return;
            case 'schema.listFunctions':
                await fulfillAction(route, { functions: [] });
                return;
            case 'tab.list':
                await fulfillAction(route, []);
                return;
            case 'tab.create':
                await fulfillAction(route, {
                    tabId: payload.input?.tabId,
                    tabType: 'sql',
                    tabName: payload.input?.tabName ?? 'New Query',
                    content: payload.input?.content ?? '',
                    status: 'idle',
                    userId: 'e2e-user',
                    connectionId: connection.connection.id,
                    createdAt: new Date().toISOString(),
                });
                return;
            case 'query.resultSets.list':
                await fulfillAction(route, { resultSets: [] });
                return;
            default:
                await fulfillAction(route, { ok: true });
        }
    });
}

async function expectUnifiedMenu(page: Page) {
    const menu = page.getByTestId('table-context-menu');
    await expect(menu).toBeVisible();
    await expect(menu).toHaveClass(/w-52/);
    await expect(menu.getByRole('menuitem')).toHaveText(expectedMenuItems);
}

test('SQL Console right click temporarily highlights a table and exposes the unified menu', async ({ page, appErrors }) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await mockTableActions(page);
    await openMockConnectionConsole(page, connection, { requireInteractiveReady: false });

    const tableButton = page.getByRole('button', { name: /Insert select for.*numbers/i });
    await expect(tableButton).toBeVisible();
    const trigger = page.locator('div.group\\/table-row').filter({ hasText: 'numbers' });
    await tableButton.click({ button: 'right' });

    await expect(trigger).toHaveAttribute('data-state', 'open');
    await expectUnifiedMenu(page);
    await page.keyboard.press('Escape');
    await expect(trigger).not.toHaveAttribute('data-state', 'open');

    await tableButton.click({ button: 'right' });
    await page.getByTestId('table-context-menu').getByRole('menuitem', { name: 'Rename' }).click();
    await expect(page.getByRole('dialog', { name: 'Rename table' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    const pathnameBeforeImport = new URL(page.url()).pathname;
    await tableButton.click({ button: 'right' });
    await page.getByTestId('table-context-menu').getByRole('menuitem', { name: 'Import Data' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(pathnameBeforeImport);
    await expectAppHealthy(appErrors);
});

test('Explorer keeps its route selection while right-clicking and hands Quick Query to SQL Console once', async ({ page, appErrors }) => {
    await mockWorkbenchApis(page, { initialConnections: [connection] });
    await mockTableActions(page);
    await openMockConnectionConsole(page, connection, { requireInteractiveReady: false });
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.getByRole('link', { name: 'Explorer', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${organization}/${connection.connection.id}/explorer`));

    const expandDatabase = page.getByRole('button', { name: /Expand demo/i });
    await expect(expandDatabase).toBeVisible();
    await expandDatabase.click();
    const expandSchema = page.getByRole('button', { name: /Expand default/i });
    if (await expandSchema.isVisible().catch(() => false)) await expandSchema.click();
    const expandTables = page.getByRole('button', { name: /Expand Tables/i });
    await expect(expandTables).toBeVisible();
    await expandTables.click();

    const tableButton = page.getByRole('button', { name: 'numbers', exact: true });
    await expect(tableButton).toBeVisible();
    const trigger = page.locator('button[title="numbers"]');
    const explorerUrl = page.url();
    await tableButton.click({ button: 'right' });

    await expect(trigger).toHaveAttribute('data-state', 'open');
    await expect(page).toHaveURL(explorerUrl);
    await expectUnifiedMenu(page);

    const queryRequest = page.waitForRequest(request => request.url().includes('/api/sql-console/query/stream') && request.method() === 'POST');
    await page.getByTestId('table-context-menu').getByRole('menuitem', { name: 'Quick Query' }).click();
    await expect(page).toHaveURL(new RegExp(`/${organization}/${connection.connection.id}/sql-console`));
    const request = await queryRequest;
    const queryPayload = request.postDataJSON() as { input?: { sql?: string; database?: string }; currentConnectionId?: string };
    expect(queryPayload.currentConnectionId).toBe(connection.connection.id);
    expect(queryPayload.input?.database).toBe('demo');
    expect(queryPayload.input?.sql).toContain('`demo`.`numbers`');
    await expectAppHealthy(appErrors);
});
