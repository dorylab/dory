import { expect, test as setup } from '@playwright/test';

setup.setTimeout(process.env.CI ? 120_000 : 60_000);

function isLandingUrl(url: string) {
    return /\/[^/]+\/work$/.test(new URL(url).pathname);
}

setup('authenticate demo user', async ({ page, context }) => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        await page.goto('/sign-in');

        if (isLandingUrl(page.url())) {
            break;
        }

        const demoButton = page
            .getByTestId('demo-sign-in')
            .or(page.getByRole('button', { name: /enter as demo|login as demo|sign in as demo/i }))
            .or(page.getByTestId('guest-sign-in'))
            .first();

        try {
            await expect(demoButton).toBeVisible({ timeout: 20_000 });
        } catch (error) {
            if (isLandingUrl(page.url())) {
                break;
            }

            throw error;
        }

        await expect(demoButton).toBeEnabled({ timeout: 20_000 });

        const navigation = page
            .waitForURL(/\/[^/]+\/work$/, { timeout: 30_000, waitUntil: 'domcontentloaded' })
            .then(() => true)
            .catch(() => false);
        await demoButton.click();

        if (await navigation) {
            break;
        }

        if (attempt === 3) {
            throw new Error('Demo sign-in did not navigate to the default workspace page after 3 attempts.');
        }
    }

    await context.storageState({ path: 'playwright/.auth/user.json' });
});
