import { expect } from '@playwright/test';

import { expectAppHealthy, test } from './fixtures';

test.use({ storageState: { cookies: [], origins: [] } });

test('unknown API routes do not redirect to sign-in', async ({ request }) => {
    for (const path of ['/api/trpc/authConfig.google.isSetup', '/api/does-not-exist']) {
        const response = await request.get(path, { maxRedirects: 0 });

        expect(response.status(), path).toBe(404);
        expect(response.headers().location, path).toBeUndefined();
    }

    const session = await request.get('/api/auth/get-session', { maxRedirects: 0 });
    expect(session.status()).toBe(200);
    expect(await session.json()).toBeNull();
});

test('sign-in stays mounted after startup', async ({ page, appErrors }) => {
    let signInRequests = 0;
    page.on('request', request => {
        if (new URL(request.url()).pathname === '/sign-in') {
            signInRequests++;
        }
    });

    await page.goto('/sign-in');
    await expect(page.getByTestId('sign-in-form')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const initialRequests = signInRequests;

    await page.waitForTimeout(3000);

    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByTestId('sign-in-form')).toBeVisible();
    expect(signInRequests).toBe(initialRequests);
    await expectAppHealthy(appErrors);
});
