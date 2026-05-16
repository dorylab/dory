import { expect, test as setup } from '@playwright/test';

setup.setTimeout(process.env.CI ? 120_000 : 60_000);

function isConnectionsUrl(url: string) {
    return /\/[^/]+\/connections$/.test(new URL(url).pathname);
}

setup('authenticate demo user', async ({ page, context }) => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        await page.goto('/sign-in');

        if (isConnectionsUrl(page.url())) {
            break;
        }

        const demoButton = page
            .getByTestId('demo-sign-in')
            .or(page.getByRole('button', { name: /enter as demo|login as demo|sign in as demo/i }));

        try {
            await expect(demoButton).toBeVisible({ timeout: 20_000 });
        } catch (error) {
            if (isConnectionsUrl(page.url())) {
                break;
            }

            throw error;
        }

        await expect(demoButton).toBeEnabled({ timeout: 20_000 });

        const navigation = page.waitForURL(/\/[^/]+\/connections$/, { timeout: 30_000 }).catch(() => null);
        await demoButton.click();

        if (await navigation) {
            break;
        }

        if (attempt === 3) {
            throw new Error('Demo sign-in did not navigate to the connections page after 3 attempts.');
        }
    }

    await context.storageState({ path: 'playwright/.auth/user.json' });
});
