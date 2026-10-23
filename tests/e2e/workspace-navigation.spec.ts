import { expect } from '@playwright/test';
import { test } from './fixtures';
import en from '../../packages/i18n/src/locales/en.json';
import zh from '../../packages/i18n/src/locales/zh.json';
import ja from '../../packages/i18n/src/locales/ja.json';
import es from '../../packages/i18n/src/locales/es.json';

for (const [locale, messages] of Object.entries({ en, zh, ja, es })) {
    test(`${locale}: workspace navigation, reports and explicit destinations`, async ({ page, context, baseURL }, testInfo) => {
        await context.addCookies([{ name: 'locale', value: locale, url: baseURL! }]);
        await page.route('**/api/data-agent', route => route.fulfill({ json: { connections: [], models: [], sessions: [] } }));
        await page.route('**/api/work-documents?*', route => route.fulfill({ json: { documents: [] } }));
        await page.goto('/');
        await page.waitForURL(/\/[^/]+\/work$/);
        const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
        await page.goto(`/${organization}/works`);
        const navigation = page
            .locator('[data-sidebar="menu"]')
            .filter({ has: page.locator(`a[href="/${organization}/connections"]`) })
            .first();
        await expect(navigation.locator(':scope > li > [data-sidebar="menu-button"]')).toHaveText([
            messages.AppSidebar.DataSources,
            messages.AppSidebar.Chatbot,
            messages.AppSidebar.Reports,
            messages.AppSidebar.Knowledge,
            messages.AppSidebar.More,
        ]);
        await expect(page.getByRole('heading', { name: messages.WorkDocuments.Reports, exact: true })).toBeVisible();
        await expect(navigation.getByRole('link', { name: messages.AppSidebar.Reports, exact: true })).toHaveAttribute('data-active', 'true');
        await expect(page.getByPlaceholder(messages.WorkDocuments.Search)).toBeVisible();
        if (locale === 'zh') await page.screenshot({ path: testInfo.outputPath('reports-navigation-zh.png'), fullPage: true });
        await expect(page.getByRole('option', { name: messages.WorkDocuments.AllSources, exact: true })).toHaveCount(1);
        await page.getByRole('button', { name: messages.Connections['All Connections'], exact: true }).click();
        await page.getByRole('menuitem', { name: messages.Connections['All Connections'], exact: true }).click();
        await page.waitForURL(`**/${organization}/work`);
        await expect(page.getByTestId('data-agent')).toBeVisible();
        await expect(navigation.getByRole('link', { name: messages.AppSidebar.Chatbot, exact: true })).toHaveAttribute('data-active', 'true');
        await page.goto(`/sign-in?callbackURL=${encodeURIComponent(`/${organization}/works`)}`);
        await page.waitForURL(`**/${organization}/works`);
        await expect(page.getByRole('heading', { name: messages.WorkDocuments.Reports, exact: true })).toBeVisible();
    });
}

test.describe('new guest default', () => {
    test.use({ storageState: { cookies: [], origins: [] } });
    test('new guests open Work on first entry, recovery and repeated entry', async ({ page, context }) => {
        await page.goto('/sign-in');
        const origin = new URL(page.url()).origin;
        const signIn = await page.request.post('/api/auth/sign-in/anonymous', { headers: { Origin: origin }, data: {} });
        expect(signIn.ok(), await signIn.text()).toBeTruthy();
        const bootstrap = await page.request.post('/api/auth/anonymous/bootstrap', { headers: { Origin: origin }, data: {} });
        expect(bootstrap.ok(), await bootstrap.text()).toBeTruthy();
        const { organizationSlug } = await bootstrap.json();
        await context.clearCookies({ name: /better-auth\.session/ });
        await page.goto(`/sign-in?callbackURL=${encodeURIComponent(`/${organizationSlug}/works`)}`);
        await page.getByTestId('guest-sign-in').click();
        await page.waitForURL(`**/${organizationSlug}/works`);
        for (const path of ['/', `/${organizationSlug}`]) {
            await page.goto(path);
            await page.waitForURL(`**/${organizationSlug}/work`);
            await expect(page.getByTestId('data-agent')).toBeVisible();
        }
    });
});

test('legacy Work links preserve conversation, report and repeated query parameters', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/[^/]+\/work$/);
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    const query = 'chat=saved-chat&document=saved-report&revision=2&sources=one%2Ctwo&tag=a&tag=b';
    const response = await page.request.get(`/${organization}/data-agent?${query}`, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    const target = new URL(response.headers().location, page.url());
    expect(target.pathname).toBe(`/${organization}/work`);
    expect([...target.searchParams]).toEqual([...new URLSearchParams(query)]);
});
