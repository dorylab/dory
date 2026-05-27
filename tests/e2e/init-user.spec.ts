import { expect } from '@playwright/test';

import { expectAppHealthy, test } from './fixtures';

const initEmail = process.env.DORY_INIT_USER_EMAIL?.trim() ?? '';
const initPassword = process.env.DORY_INIT_USER_PASSWORD?.trim() ?? '';

test.skip(!initEmail || !initPassword, 'DORY_INIT_USER_EMAIL and DORY_INIT_USER_PASSWORD are required for this test');

test.use({ storageState: { cookies: [], origins: [] } });

test('init user can sign in and reach the default organization workspace', async ({ page, appErrors }) => {
    await page.goto('/sign-in');

    const form = page.getByTestId('sign-in-form');
    await form.locator('input[type="email"]').fill(initEmail);
    await form.locator('input[type="password"]').fill(initPassword);
    await form.locator('button[type="submit"]').click();

    await page.waitForURL(/\/[^/]+\/connections$/);

    await expect(page.getByRole('heading', { name: /data sources/i })).toBeVisible();
    await expect(page.getByText(initEmail)).toBeVisible();
    await expectAppHealthy(appErrors);
});
