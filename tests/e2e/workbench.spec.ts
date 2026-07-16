import { expect, type Locator } from '@playwright/test';

import { expectAppHealthy, test } from './fixtures';
import { createWorkbenchConnection, mockWorkbenchApis, openMockConnectionConsole, setSqlEditorValue } from './helpers/workbench';

const seededConnection = createWorkbenchConnection();

async function runQueryUntilRequest(page: Parameters<typeof test>[0]['page']) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const responsePromise = page
            .waitForResponse(response => response.url().includes('/api/query') && response.request().method() === 'POST', { timeout: 2000 })
            .catch(() => null);

        await page.getByTestId('run-query').click();

        const response = await responsePromise;
        if (response) {
            return response;
        }
    }

    throw new Error('Query request was not sent after retrying the Run action.');
}

async function requiredBox(locator: Locator, name: string) {
    const box = await locator.boundingBox();
    expect(box, `${name} should have a bounding box`).not.toBeNull();
    if (!box) {
        throw new Error(`${name} should have a bounding box`);
    }
    return box;
}

test('can create a connection from the connections page', async ({ page, appErrors }) => {
    await mockWorkbenchApis(page);

    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/connections$/);

    await page.getByRole('button', { name: /add connection/i }).click();
    const dialog = page.getByRole('dialog', { name: /create connection/i });
    await page.getByLabel(/Connection Name/i).fill('E2E ClickHouse');
    await page.getByLabel(/Host/i).fill('localhost');
    await page.getByLabel(/HTTP Port/i).fill('8123');
    await page.getByLabel(/Database Username/i).fill('default');
    await dialog.locator('input[type="password"]').fill('password');

    await page.getByRole('button', { name: /test connection/i }).click();
    await expect(page.getByText(/24\.8\.1/)).toBeVisible();

    await page.getByRole('button', { name: /create connection/i }).click();
    await expect(page.getByRole('main').getByText('E2E ClickHouse')).toBeVisible();
    await expectAppHealthy(appErrors);
});

test('resizes SQL editor and result panels on the first upward drag', async ({ page, appErrors }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
        window.localStorage.removeItem('sqlConsole.editorResultLayoutByScope');
    });
    await mockWorkbenchApis(page, { initialConnections: [seededConnection] });
    await openMockConnectionConsole(page, seededConnection);

    const newConsoleButton = page.getByRole('button', { name: /New Console/i });
    await expect(newConsoleButton).toBeEnabled();
    await newConsoleButton.click();
    await expect(page.getByTestId('sql-editor')).toBeVisible();

    const editorPanel = page
        .locator('[data-panel][id="editor-panel"]')
        .filter({ has: page.getByTestId('sql-editor') })
        .first();
    const resultPanel = page
        .locator('[data-panel][id="result-panel"]')
        .filter({ has: page.getByTestId('result-table') })
        .first();
    await expect(editorPanel).toBeVisible();
    await expect(resultPanel).toBeVisible();

    const editorBefore = await requiredBox(editorPanel, 'editor panel before resize');
    const resultBefore = await requiredBox(resultPanel, 'result panel before resize');
    const startX = editorBefore.x + editorBefore.width / 2;
    const startY = editorBefore.y + editorBefore.height + 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY - 80, { steps: 10 });
    await page.mouse.up();

    const editorAfter = await requiredBox(editorPanel, 'editor panel after resize');
    const resultAfter = await requiredBox(resultPanel, 'result panel after resize');

    expect(editorAfter.height).toBeLessThan(editorBefore.height - 30);
    expect(resultAfter.height).toBeGreaterThan(resultBefore.height + 30);
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

test('keeps query results visible after switching SQL tabs', async ({ page, appErrors }) => {
    await mockWorkbenchApis(page, { initialConnections: [seededConnection] });
    await openMockConnectionConsole(page, seededConnection);

    const newConsoleButton = page.getByRole('button', { name: /New Console/i });
    await expect(newConsoleButton).toBeEnabled();
    await newConsoleButton.click();
    await expect(page.locator('.sql-editor-container')).toBeVisible();

    await setSqlEditorValue(page, 'SELECT 1 AS value');
    await runQueryUntilRequest(page);

    const firstSqlTab = page.getByRole('tab', { name: /SELECT 1|New Query|Untitled Query/i }).first();
    const resultCell = page.getByRole('button', { name: '1' }).last();
    await expect(firstSqlTab).toBeVisible();
    await expect(resultCell).toBeVisible();

    await page.getByRole('button', { name: /Add tab/i }).click();
    await expect(firstSqlTab).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('[aria-hidden="true"] [data-testid="result-table-content"]')).toHaveCount(1);
    await expect(resultCell.locator('xpath=ancestor::*[@aria-hidden="true"][1]')).toHaveCSS('opacity', '0');
    await firstSqlTab.click();

    await expect(firstSqlTab).toHaveAttribute('aria-selected', 'true');
    await expect(resultCell).toBeVisible();
    await expectAppHealthy(appErrors);
});

test('does not duplicate SQL completion items across open tabs', async ({ page, appErrors }) => {
    await mockWorkbenchApis(page, { initialConnections: [seededConnection] });
    await openMockConnectionConsole(page, seededConnection);

    const newConsoleButton = page.getByRole('button', { name: /New Console/i });
    await expect(newConsoleButton).toBeEnabled();
    await newConsoleButton.click();
    await expect(page.getByText('numbers', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: /Add tab/i }).click();
    await expect(page.locator('.monaco-editor')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getModelCount())).toBe(2);
    await setSqlEditorValue(page, 'SELECT * FROM n');
    await page.keyboard.press('Control+Space');

    const matchingCompletionItems = page.locator('.suggest-widget .monaco-list-row .label-name').filter({ hasText: /^numbers$/ });
    await expect(matchingCompletionItems).toHaveCount(1);
    await expectAppHealthy(appErrors);
});

test('keeps one Monaco editor with independent SQL models', async ({ page, appErrors }) => {
    await mockWorkbenchApis(page, { initialConnections: [seededConnection] });
    await openMockConnectionConsole(page, seededConnection);

    await page.getByRole('button', { name: /New Console/i }).click();
    const firstSql = Array.from({ length: 80 }, (_, index) => `SELECT ${index} AS first_tab;`).join('\n');
    await setSqlEditorValue(page, firstSql);
    await page.evaluate(() => {
        window.__DORY_E2E_MONACO__?.setSelection({
            startLineNumber: 10,
            startColumn: 2,
            endLineNumber: 10,
            endColumn: 6,
        });
        window.__DORY_E2E_MONACO__?.setScrollTop(400);
    });
    const sqlTabs = page.locator('[role="tab"]').filter({ has: page.locator('svg.lucide-file-text') });
    const firstTab = sqlTabs.first();

    await page.getByRole('button', { name: /Add tab/i }).click();
    await setSqlEditorValue(page, 'SELECT 2 AS second_tab');
    await setSqlEditorValue(page, 'SELECT 3 AS second_tab');
    const secondTab = sqlTabs.nth(1);

    await expect(page.locator('.monaco-editor')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getModelCount())).toBe(2);

    await firstTab.click();
    await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getValue())).toBe(firstSql);
    await expect
        .poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getSelection()))
        .toEqual({
            startLineNumber: 10,
            startColumn: 2,
            endLineNumber: 10,
            endColumn: 6,
        });
    await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getScrollTop() ?? 0)).toBeGreaterThan(350);
    await secondTab.click();
    await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getValue())).toBe('SELECT 3 AS second_tab');
    await page.evaluate(() => window.__DORY_E2E_MONACO__?.undo());
    await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getValue())).toBe('SELECT 2 AS second_tab');
    await firstTab.click();
    await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getValue())).toBe(firstSql);
    await secondTab.click();

    await secondTab.locator('button').click({ force: true });
    await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getModelCount())).toBe(1);
    await expect(page.locator('.monaco-editor')).toHaveCount(1);

    await page.getByRole('button', { name: /Insert select for numbers/i }).click();
    await expect(page.getByTestId('sql-editor')).toBeHidden();
    await expect(page.locator('.monaco-editor')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getModelCount())).toBe(1);
    await firstTab.click();
    await expect(page.getByTestId('sql-editor')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__DORY_E2E_MONACO__?.getValue())).toBe(firstSql);
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
