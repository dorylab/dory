import { expect } from '@playwright/test';

import { expectAppHealthy, test } from './fixtures';

test('shows create-new fields for SQLite and DuckDB without creating a file during testing', async ({ page, appErrors }) => {
    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/connections$/);

    await page.getByRole('button', { name: /add (connection|data source)/i }).click();
    const dialog = page.getByTestId('connection-dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Type').click();
    await page.getByRole('option', { name: 'SQLite' }).click();
    await expect(dialog.getByText('Existing database file', { exact: true })).toBeVisible();
    await expect(dialog.getByTestId('test-connection')).toBeEnabled();

    await dialog.getByText('Create new database', { exact: true }).click();
    await expect(dialog.getByLabel('File name')).toHaveValue('demo.sqlite');
    await expect(dialog.getByLabel('Location')).toHaveValue('~/Dory/databases');
    await expect(dialog.getByTestId('test-connection')).toBeDisabled();
    await expect(dialog.getByText('The database will be created when you create this data source.', { exact: true })).toBeVisible();

    await dialog.getByLabel('Type').click();
    await page.getByRole('option', { name: 'DuckDB' }).click();
    await dialog.getByText('Create new database', { exact: true }).click();
    await expect(dialog.getByLabel('File name')).toHaveValue('demo.duckdb');
    await expect(dialog.getByLabel('Location')).toHaveValue('~/Dory/databases');
    await expect(dialog.getByTestId('test-connection')).toBeDisabled();
    await expectAppHealthy(appErrors);
});
