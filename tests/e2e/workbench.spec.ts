import { expect } from '@playwright/test';

import { expectAppHealthy, test } from './fixtures';
import { createWorkbenchConnection, mockWorkbenchApis, openMockConnectionConsole, setSqlEditorValue } from './helpers/workbench';

const seededConnection = createWorkbenchConnection();

async function runQueryUntilRequest(page: Parameters<typeof test>[0]['page']) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const responsePromise = page
            .waitForResponse(
                response => response.url().includes('/api/query') && response.request().method() === 'POST',
                { timeout: 2000 },
            )
            .catch(() => null);

        await page.getByTestId('run-query').click();

        const response = await responsePromise;
        if (response) {
            return response;
        }
    }

    throw new Error('Query request was not sent after retrying the Run action.');
}

test('can create a data source from the data sources page', async ({ page, appErrors }) => {
    await mockWorkbenchApis(page);

    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/connections$/);

    await page.getByRole('button', { name: /add data source/i }).click();
    const dialog = page.getByRole('dialog', { name: /create data source/i });
    await page.getByLabel(/Data Source Name/i).fill('E2E ClickHouse');
    await page.getByLabel(/Host/i).fill('localhost');
    await page.getByLabel(/HTTP Port/i).fill('8123');
    await page.getByLabel(/Database Username/i).fill('default');
    await dialog.locator('input[type="password"]').fill('password');

    await page.getByRole('button', { name: /test data source/i }).click();
    await expect(page.getByText(/24\.8\.1/)).toBeVisible();

    await page.getByRole('button', { name: /create data source/i }).click();
    await expect(page.getByRole('main').getByText('E2E ClickHouse')).toBeVisible();
    await expectAppHealthy(appErrors);
});

test('can open SQL editor and run a query', async ({ page, appErrors }) => {
    await mockWorkbenchApis(page, { initialConnections: [seededConnection] });
    await openMockConnectionConsole(page, seededConnection);

    const newConsoleButton = page.getByRole('button', { name: /New Console/i });
    await expect(newConsoleButton).toBeEnabled();
    await newConsoleButton.click();
    await expect(page.locator('.sql-editor-container')).toBeVisible();

    await setSqlEditorValue(page, 'SELECT 1 AS value');
    await runQueryUntilRequest(page);

    await expect(page.getByTestId('result-table-content')).toBeVisible();
    await expect(page.getByRole('button', { name: 'value' })).toBeVisible();
    await expect(page.getByRole('button', { name: '1' }).last()).toBeVisible();
    await expect(page.getByText(/Run the query first/i)).toBeHidden();
    await expectAppHealthy(appErrors);
});

test('shows a readable SQL error without crashing the page', async ({ page, appErrors }) => {
    await mockWorkbenchApis(page, { initialConnections: [seededConnection] });
    await openMockConnectionConsole(page, seededConnection);

    const newConsoleButton = page.getByRole('button', { name: /New Console/i });
    await expect(newConsoleButton).toBeEnabled();
    await newConsoleButton.click();
    await expect(page.locator('.sql-editor-container')).toBeVisible();

    await setSqlEditorValue(page, 'SELECT FROM missing_table');
    await runQueryUntilRequest(page);

    await expect(page.getByRole('tab', { name: /Result 1/i })).toBeVisible();
    await expect(page.getByText(/^Failed$/)).toBeVisible();
    await expect(page.getByText(/SELECT FROM missing_table LIMIT 200/i)).toBeVisible();
    await expect(page.locator('.sql-editor-container')).toBeVisible();
    await expectAppHealthy(appErrors);
});
