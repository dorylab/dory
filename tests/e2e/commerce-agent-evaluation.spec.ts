import { expect } from '@playwright/test';

import { expectAppHealthy, test } from './fixtures';

test.skip(process.env.E2E_COMMERCE_EVALUATION !== '1', 'Seed Commerce Agent Evaluation first and explicitly opt into this local live smoke test.');

test('Commerce Agent Evaluation connection, Knowledge, Agent Runs, and Artifacts pages are reachable', async ({ page, appErrors }) => {
    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/connections$/);
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0]!;

    await expect(page.getByText('Commerce Agent Evaluation', { exact: true })).toBeVisible();

    await page.goto(`/${organization}/knowledge`);
    await expect(page.getByText('Commerce Operations Knowledge', { exact: true })).toBeVisible();

    await page.goto(`/${organization}/agent-runs`);
    await expect(page.getByRole('heading', { name: /Agent Runs/i })).toBeVisible();

    await page.goto(`/${organization}/artifacts`);
    await expect(page.getByRole('heading', { name: /Artifacts/i })).toBeVisible();
    await expectAppHealthy(appErrors);
});
