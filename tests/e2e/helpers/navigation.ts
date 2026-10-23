import type { Page } from '@playwright/test';

export async function openDataSources(page: Page) {
    await page.waitForURL(/\/[^/]+\/(?:connections|work)$/);
    const organization = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
    await page.goto(`/${organization}/connections`);
}
