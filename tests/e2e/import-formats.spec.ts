import { expectAppHealthy, test } from './fixtures';

test('import wizard accepts typed source formats and identifies Parquet before upload', async ({ page, appErrors }) => {
    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/connections$/);

    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    if (!organization) throw new Error('The demo workspace does not contain an organization');

    const connectionCard = page.getByTestId('connection-card').filter({ hasText: 'Demo Database' }).first();
    await connectionCard.waitFor({ state: 'visible' });
    const connectionId = await connectionCard.getAttribute('data-connection-id');
    if (!connectionId) throw new Error('The demo workspace does not contain an importable connection');

    const importListPath = `/${encodeURIComponent(organization)}/${encodeURIComponent(connectionId)}/import`;
    await page.goto(importListPath, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Data import' }).waitFor({ state: 'visible' });
    await page.getByRole('link', { name: 'New import' }).click();
    await page.waitForURL(url => url.pathname === `${importListPath}/new`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('heading', { name: 'Choose a data file' }).waitFor({ state: 'visible' });

    const input = page.locator('input[type="file"]');
    const accept = await input.getAttribute('accept');
    for (const extension of ['.csv', '.tsv', '.parquet', '.ndjson', '.jsonl', '.arrow', '.ipc', '.feather']) {
        if (!accept?.includes(extension)) throw new Error(`Import file input is missing ${extension}`);
    }

    await input.setInputFiles({ name: 'customers.parquet', mimeType: 'application/vnd.apache.parquet', buffer: Buffer.from('PAR1') });
    await page.getByText('customers.parquet', { exact: true }).waitFor({ state: 'visible' });
    await page.getByText('Parquet', { exact: true }).waitFor({ state: 'visible' });
    await expectAppHealthy(appErrors);
});
