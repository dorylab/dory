import { expect } from '@playwright/test';

import { test } from './fixtures';

const instantNavigationEnabled = process.env.NEXT_PUBLIC_DORY_INSTANT_NAVIGATION === 'true';

test.describe('instant workbench navigation', () => {
    test.skip(!instantNavigationEnabled, 'Runs only when NEXT_PUBLIC_DORY_INSTANT_NAVIGATION=true.');

    test('keeps the client document while moving between SQL Console and Explorer', async ({ page }) => {
        await page.goto('/');
        await page.waitForURL(/\/[^/]+\/connections$/);

        const connectionCard = page.getByTestId('connection-card').filter({ hasText: 'Demo Database' }).first();
        await expect(connectionCard).toBeVisible();

        const connectionId = await connectionCard.getAttribute('data-connection-id');
        if (!connectionId) throw new Error('The demo workspace does not contain a connection id.');

        const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
        if (!organization) throw new Error('The demo workspace does not contain an organization.');

        await connectionCard.click();
        await page
            .waitForURL(new RegExp(`/${organization}/${connectionId}/sql-console$`), { timeout: 5_000 })
            .catch(() => page.goto(`/${organization}/${connectionId}/sql-console`));

        await page.evaluate(() => sessionStorage.setItem('instant-navigation-document-marker', 'preserved'));

        const explorerLink = page.getByRole('link', { name: 'Explorer', exact: true });
        await expect(explorerLink).toBeVisible();
        await explorerLink.hover();
        await explorerLink.click();
        await page.waitForURL(new RegExp(`/${organization}/${connectionId}/explorer`));
        await expect.poll(() => page.evaluate(() => sessionStorage.getItem('instant-navigation-document-marker'))).toBe('preserved');

        const sqlConsoleLink = page.getByRole('link', { name: 'SQL Console', exact: true });
        await expect(sqlConsoleLink).toBeVisible();
        await sqlConsoleLink.hover();
        await sqlConsoleLink.click();
        await page.waitForURL(new RegExp(`/${organization}/${connectionId}/sql-console$`));
        await expect.poll(() => page.evaluate(() => sessionStorage.getItem('instant-navigation-document-marker'))).toBe('preserved');
    });
});
